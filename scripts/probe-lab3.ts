/** How far back PSX's payouts list and the index dividend-discount page reach. */
import { fetchRaw } from '../src/psx/api';
async function retry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
const rows = (h: string) => [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).join(' | '));
(async () => {
  const forms: Record<string, string>[] = [
    { symbol: 'FFC', count: '500', offset: '0' },
    { symbol: '', count: '50', offset: '700' },
  ];
  for (const f of forms) {
    try { const r = await retry(() => fetchRaw('/payouts', f)); const rr = rows(r); console.log(`\n/payouts ${JSON.stringify(f)} rows ${rr.length}`, r.match(/Showing[^<]*/)?.[0]); console.log(rr.slice(0, 3).join('\n')); console.log('...'); console.log(rr.slice(-4).join('\n')); } catch (e) { console.log('ERR', (e as Error).message); }
  }
  try {
    const page = await retry(() => fetchRaw('/indices-div-discount', undefined, false));
    const main = page.slice(page.indexOf('page__content') - 20).replace(/<script[\s\S]*?<\/script>/g, '').replace(/\s+/g, ' ');
    console.log('\nDIV DISCOUNT PAGE', main.slice(0, 3000));
  } catch (e) { console.log('ERR dd', (e as Error).message); }
  const js = await retry(() => fetchRaw('/static/script.js?v=1.79', undefined, false));
  let i = -1;
  while ((i = js.indexOf('div-discount', i + 1)) >= 0) console.log('\nJS ...', js.slice(Math.max(0, i - 200), i + 1500).replace(/\s+/g, ' '));
  i = js.indexOf('IndicesDivDiscount');
  while (i >= 0) { console.log('\nJS2 ...', js.slice(i, i + 1500)); i = js.indexOf('IndicesDivDiscount', i + 1); }
})();
