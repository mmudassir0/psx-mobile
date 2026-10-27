/** Looks for older dividend history on PSX: site links and announcement search. */
import { fetchRaw } from '../src/psx/api';
async function retry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
(async () => {
  const home = await retry(() => fetchRaw('/', undefined, false));
  console.log('links:', [...new Set([...home.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))].join(' '));
  const js = await retry(() => fetchRaw('/static/script.js?v=1.76', undefined, false)).catch(() => '');
  console.log('js urls:', [...new Set([...js.matchAll(/["'`](\/[a-z][a-z0-9\-\/]+)["'`]/g)].map((m) => m[1]))].join(' '));
  for (const [p, f, x] of [
    ['/announcements/companies', undefined, false],
    ['/announcements', { type: 'C', symbol: 'FFC', query: 'dividend', count: '50', offset: '0', date_from: '2017-01-01', date_to: '2019-12-31', page: 'annc' }, true],
    ['/payouts', undefined, false],
    ['/book-closures', undefined, false],
    ['/announcements/book-closures', undefined, false],
  ] as const) {
    try { const r = await fetchRaw(p, f as never, x); console.log(`\n== ${p} ${JSON.stringify(f)} ${r.length}\n`, r.replace(/\s+/g, ' ').slice(0, 2500)); } catch (e) { console.log(`\n== ${p}: ${(e as Error).message}`); }
  }
})();
