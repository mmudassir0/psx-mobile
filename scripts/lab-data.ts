/**
 * Builds lab.json, the backtesting lab's data, from the daily job's saved
 * history (cache/daily:*), the index history, and the dividend history job's
 * divs.json. Run by the daily job after the close.
 *   tsx scripts/lab-data.ts <state dir> <divs.json>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchRaw } from '../src/psx/api';
import { parseHistorical } from '../src/psx/parse';
import { buildLab, pkDay, type Bar, type BuildStock } from '../src/lab/build';

const [stateDir, divsFile] = process.argv.slice(2);
const cacheDir = join(stateDir, 'cache');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await sleep(3000 * (i + 1));
    }
  }
  throw last;
}

interface DivState {
  symbols: Record<string, { list: { ex: string; y: number }[]; fac?: [string, number][] }>;
  shariah?: string[];
  kmi30?: string[];
  kse100?: string[];
}

const MONTH_END: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function indexHistory(code: string): Promise<Map<string, number>> {
  const file = join(stateDir, `lab-index-${code}.json`);
  let rows: [string, number][] = [];
  if (existsSync(file)) rows = JSON.parse(readFileSync(file, 'utf8'));
  const fresh = rows.length && rows[rows.length - 1][0] >= pkDay(Date.now() - 864e5 * 3);
  if (!fresh || process.env.EVENING) {
    try {
      const bars = parseHistorical(await retry(() => fetchRaw('/historical', { month: '0', year: '0', symbol: code })));
      if (bars.length > 1000) rows = bars.filter((b) => b.c > 0).map((b) => [pkDay(b.t), b.c]);
      writeFileSync(file, JSON.stringify(rows));
    } catch (e) {
      console.log(`${code} history: ${(e as Error).message}${rows.length ? ' (using the saved copy)' : ''}`);
    }
  }
  return new Map(rows);
}

async function main() {
  const divs: DivState = existsSync(divsFile) ? JSON.parse(readFileSync(divsFile, 'utf8')) : { symbols: {} };
  const sectors: Record<string, string> = existsSync(join(stateDir, 'sectors.json')) ? JSON.parse(readFileSync(join(stateDir, 'sectors.json'), 'utf8')) : {};
  const idx: Record<string, string[]> = existsSync(join(stateDir, 'indexes.json')) ? JSON.parse(readFileSync(join(stateDir, 'indexes.json'), 'utf8')) : {};
  const kse = new Set(idx.KSE100 ?? divs.kse100 ?? []);
  const kmi = new Set(idx.KMI30 ?? divs.kmi30 ?? []);
  const shariah = new Set([...(divs.shariah ?? []), ...kmi]);
  const [KSE100, KMI30] = [await indexHistory('KSE100'), await indexHistory('KMI30')];
  if (KSE100.size < 1000) throw new Error('no index history');
  const stocks: BuildStock[] = [];
  for (const f of readdirSync(cacheDir).filter((x) => x.startsWith('daily_3A'))) {
    const symbol = decodeURIComponent(f.slice(0, -5).replace(/_/g, '%')).replace(/^daily:/, '');
    if (!sectors[symbol] || /BILLS|BONDS|SUKUK|TFC|ETF|MUTUAL|MODARABA|OPEN-END|CLOSE-END/i.test(sectors[symbol])) continue;
    let bars: Bar[];
    try {
      bars = JSON.parse(readFileSync(join(cacheDir, f), 'utf8')).data?.bars ?? [];
    } catch {
      continue;
    }
    if (bars.length < 300) continue;
    const closeOn = new Map(bars.map((b) => [pkDay(b[0]), b[4]]));
    const days = [...closeOn.keys()];
    const before = (d: string) => {
      let r: number | null = null;
      for (const x of days) {
        if (x >= d) break;
        r = closeOn.get(x)!;
      }
      return r;
    };
    const ds = divs.symbols[symbol];
    // dividends in the same adjusted rupees as the prices: the yield on the raw price × the adjusted close
    const dv = (ds?.list ?? []).map((r) => ({ day: r.ex, dps: r.y * (before(r.ex) ?? 0) })).filter((r) => r.dps > 0);
    // yearly EPS from the company page, known about three months after the year ends
    const eps: { day: string; eps: number }[] = [];
    const cf = join(cacheDir, `company_3A${encodeURIComponent(symbol).replace(/%/g, '_')}.json`);
    if (existsSync(cf)) {
      try {
        const c = JSON.parse(readFileSync(cf, 'utf8')).data;
        const row = c.financialsAnnual?.rows?.find((r: { label: string }) => /^eps$|earnings per share/i.test(r.label));
        const endM = MONTH_END[String(c.fiscalYearEnd ?? 'june').toLowerCase()] ?? 6;
        (c.financialsAnnual?.periods ?? []).forEach((p: string, k: number) => {
          const v = row?.values?.[k];
          if (typeof v !== 'number' || !/^\d{4}$/.test(p)) return;
          const end = new Date(Date.UTC(Number(p), endM, 0)).toISOString().slice(0, 10);
          const known = addDays(end, 90);
          const fac = (ds?.fac ?? []).filter((x) => x[0] <= known).pop()?.[1] ?? 1;
          eps.push({ day: known, eps: v * fac });
        });
      } catch {
        // skip
      }
    }
    stocks.push({ symbol, sector: sectors[symbol], kse100: kse.has(symbol), kmi30: kmi.has(symbol), shariah: shariah.has(symbol), bars, divs: dv, eps });
  }
  const withDivs = Object.keys(divs.symbols).length;
  const file = buildLab({ built: pkDay(Date.now()), index: { KSE100, KMI30 }, stocks, divFrom: withDivs > 50 ? '2017-01-01' : '2024-11-01', minValue: 3e6, max: 320 });
  const json = JSON.stringify(file);
  writeFileSync(join(stateDir, 'lab.json'), json);
  console.log(`lab: ${file.stocks.length} stocks, ${file.dd.length} days, ${file.stocks.reduce((a, s) => a + s.dv.length, 0)} dividends, ${Math.round(json.length / 1024)} KB`);
}

main().catch((e) => {
  console.log('lab data failed:', (e as Error).message);
});
