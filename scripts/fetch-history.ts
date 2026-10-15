/**
 * Downloads ~10 years of daily candles for every stock in the KSE-100 and the
 * KMI All Share index, for the market-wide backtest study.
 *   tsx scripts/fetch-history.ts <out dir>
 * Writes <SYM>.json as [[t,o,h,l,c,v], ...] plus index.json with what was fetched.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchDailyCandles, fetchIndexConstituents } from '../src/psx/api';
import { parseIndexConstituents } from '../src/psx/parse';

const out = process.argv[2] ?? 'history';
mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await sleep(4000 * (i + 1));
    }
  }
  throw last;
}

async function main() {
  const sets: Record<string, string[]> = {};
  for (const code of ['KSE100', 'KMIALLSHR', 'ALLSHR']) {
    try {
      sets[code] = (await retry(() => fetchIndexConstituents(code))).map((c) => c.symbol);
    } catch (e) {
      console.log(`${code}: ${(e as Error).message}`);
    }
  }
  if (!sets.KSE100?.length) {
    sets.KSE100 = parseIndexConstituents(readFileSync(join(__dirname, 'fixtures', 'index_KSE100.html'), 'utf8')).map((c) => c.symbol);
    console.log('KSE100 from the saved page');
  }
  // KSE-100 first so the core set is always complete; then the rest of the market.
  const symbols = [...new Set([...(sets.KSE100 ?? []), ...(sets.KMIALLSHR ?? []), ...(sets.ALLSHR ?? [])])];
  console.log(`${symbols.length} symbols (KSE100 ${sets.KSE100?.length ?? 0}, KMIALLSHR ${sets.KMIALLSHR?.length ?? 0}, ALLSHR ${sets.ALLSHR?.length ?? 0})`);
  const budget = Date.now() + Number(process.env.BUDGET_MIN ?? 150) * 60_000;
  const ok: Record<string, number> = {};
  const failed: string[] = [];
  for (const s of symbols) {
    if (Date.now() > budget) {
      console.log('time budget reached');
      break;
    }
    try {
      const c = await retry(() => fetchDailyCandles(s));
      writeFileSync(join(out, `${s}.json`), JSON.stringify(c.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v])));
      ok[s] = c.length;
      console.log(`${s}: ${c.length} bars`);
    } catch (e) {
      failed.push(s);
      console.log(`${s}: FAILED ${(e as Error).message}`);
    }
    await sleep(800);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify({ fetched: new Date().toISOString(), sets, ok, failed }, null, 1));
  console.log(`done: ${Object.keys(ok).length} ok, ${failed.length} failed`);
}
main();
