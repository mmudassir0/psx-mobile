/** Checks PSX's /historical with a month and year, and the sizes of the stock-page downloads. */
import { fetchMonthCandles as monthFetch, fetchRaw as rawFetch } from '../src/psx/api';
import { parseHistorical } from '../src/psx/parse';

async function retry<T>(f: () => Promise<T>, n = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw last;
}
const fetchRaw = (...a: Parameters<typeof rawFetch>) => retry(() => rawFetch(...a));
const fetchMonthCandles = (...a: Parameters<typeof monthFetch>) => retry(() => monthFetch(...a));
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
(async () => {
  const kb = (s: string) => `${(s.length / 1024).toFixed(0)} KB`;
  const all = await fetchRaw('/historical', { month: '0', year: '0', symbol: 'LUCK' });
  const allBars = parseHistorical(all);
  console.log(`all history: ${kb(all)}, ${allBars.length} bars, ${day(allBars[0].t)} → ${day(allBars[allBars.length - 1].t)}`);
  for (const [y, m] of [[2026, 10], [2026, 9], [2026, 1], [2025, 12]]) {
    const raw = await fetchRaw('/historical', { month: String(m), year: String(y), symbol: 'LUCK' });
    const bars = parseHistorical(raw);
    const inMonth = bars.every((b) => { const d = new Date(b.t + 5 * 3600e3); return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m; });
    const same = bars.every((b) => allBars.some((a) => a.t === b.t && a.c === b.c));
    console.log(`month ${y}-${m}: ${kb(raw)}, ${bars.length} bars ${bars.length ? day(bars[0].t) + ' → ' + day(bars[bars.length - 1].t) : ''}, all in month: ${inMonth}, match full history: ${same}`);
  }
  const viaFn = await fetchMonthCandles('LUCK', 2026, 10);
  console.log(`fetchMonthCandles 2026-10: ${viaFn.length} bars`);
  const eod = await fetchRaw('/timeseries/eod/LUCK');
  const company = await fetchRaw('/company/LUCK', undefined, false);
  const int = await fetchRaw('/timeseries/int/LUCK');
  console.log(`eod ${kb(eod)}, company ${kb(company)}, intraday ${kb(int)}`);
})().catch((e) => console.log('ERROR', e));
