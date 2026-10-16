/** Finds how PSX's company page loads its payouts (dividends) table. */
import { fetchRaw } from '../src/psx/api';
async function retry<T>(f: () => Promise<T>, n = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 4000 * (i + 1))); }
  }
  throw last;
}
(async () => {
  const js = await retry(() => fetchRaw('/static/script.js?v=1.76', undefined, false));
  console.log('script.js', js.length, 'chars');
  let i = -1;
  while ((i = js.indexOf('payout', i + 1)) >= 0) console.log('...', js.slice(Math.max(0, i - 300), i + 300).replace(/\s+/g, ' '), '\n');
  for (const [path, form] of [['/company/payouts', { symbol: 'LUCK' }], ['/payouts', { symbol: 'LUCK' }], ['/company/payouts/LUCK', undefined], ['/payouts/LUCK', undefined]] as const) {
    try {
      const r = await fetchRaw(path, form as never);
      console.log(`\n${path} ${JSON.stringify(form)}: ${r.length} chars\n${r.slice(0, 1500)}`);
    } catch (e) {
      console.log(`\n${path}: ${(e as Error).message}`);
    }
  }
})().catch((e) => console.log('ERROR', e));
