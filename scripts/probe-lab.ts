/** Checks what history the backtesting lab can get: index history, payouts depth, raw vs adjusted. */
import { fetchPayouts, fetchRaw, fetchSeries } from '../src/psx/api';
import { parseHistorical } from '../src/psx/parse';
const d = (t: number) => new Date(t).toISOString().slice(0, 10);
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
(async () => {
  for (const s of ['KSE100', 'KMI30', 'ALLSHR']) {
    try { const h = parseHistorical(await retry(() => fetchRaw('/historical', { month: '0', year: '0', symbol: s }))); console.log(s, 'historical', h.length, h[0] && d(h[0].t), h.at(-1) && d(h.at(-1)!.t), h[0]?.c); } catch (e) { console.log(s, 'historical ERR', (e as Error).message); }
    try { const e = await retry(() => fetchSeries('eod', s)); console.log(s, 'eod', e.length, e[0] && d(e[0].t), e.at(-1) && d(e.at(-1)!.t)); } catch (e) { console.log(s, 'eod ERR', (e as Error).message); }
  }
  for (const s of ['LUCK', 'COLG', 'HUBC', 'MEBL', 'FFC', 'ENGROH']) {
    try {
      const p = await retry(() => fetchPayouts(s));
      console.log(s, 'payouts', p.length, 'oldest', p.at(-1) && d(p.at(-1)!.announced), 'bc', p.at(-1)?.bookClosure && d(p.at(-1)!.bookClosure!));
      console.log('  ', p.slice(0, 40).map((x) => `${d(x.announced)} ${x.items.map((i) => i.pct + i.type).join('+')} bc ${x.bookClosure ? d(x.bookClosure) : '-'}`).join(' | '));
      const raw = parseHistorical(await retry(() => fetchRaw('/historical', { month: '0', year: '0', symbol: s })));
      const eod = await retry(() => fetchSeries('eod', s));
      console.log('   raw', raw.length, d(raw[0].t), 'eod', eod.length, d(eod[0].t), 'last raw', raw.at(-1)!.c, 'last eod', eod.at(-1)!.v, 'first-eod-day raw', raw.find((r) => r.t >= eod[0].t)?.c, 'eod', eod[0].v);
    } catch (e) { console.log(s, 'ERR', (e as Error).message); }
  }
})();
