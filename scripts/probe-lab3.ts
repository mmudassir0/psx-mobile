/** How the market-wide /payouts page loads its table, and whether it reaches back years. */
import { fetchRaw } from '../src/psx/api';
import { parsePayouts } from '../src/analysis/dividends';
async function retry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
(async () => {
  const page = await retry(() => fetchRaw('/payouts', undefined, false));
  const body = page.slice(page.indexOf('<body'));
  const main = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const k = main.search(/payout/i);
  console.log('PAGE', main.replace(/\s+/g, ' ').slice(Math.max(0, main.indexOf('<main')), main.indexOf('<main') + 5000));
  const js = await retry(() => fetchRaw('/static/script.js?v=1.79', undefined, false)).catch(() => fetchRaw('/static/script.js?v=1.76', undefined, false));
  let i = -1;
  while ((i = js.indexOf('/payouts', i + 1)) >= 0) console.log('\nJS ...', js.slice(Math.max(0, i - 600), i + 400).replace(/\s+/g, ' '));
  for (const form of [{ date: '2018-03-15' }, { from: '2018-01-01', to: '2018-03-31' }, { date_from: '2018-01-01', date_to: '2018-03-31' }, { year: '2018', month: '3' }]) {
    try { const r = await fetchRaw('/payouts', form); console.log(`\nPOST /payouts ${JSON.stringify(form)} ${r.length}`, r.replace(/\s+/g, ' ').slice(0, 1200), '\nparsed', parsePayouts(r).length); } catch (e) { console.log('POST', JSON.stringify(form), (e as Error).message); }
  }
})();
