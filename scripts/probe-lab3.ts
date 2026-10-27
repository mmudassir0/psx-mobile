/** Finds what the indices dividend-discount page loads. */
import { fetchRaw } from '../src/psx/api';
async function retry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
(async () => {
  const js = await retry(() => fetchRaw('/static/script.js?v=1.79', undefined, false));
  const re = /discount/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = re.exec(js))) {
    const k = Math.floor(m.index / 800);
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('\nJS ...', js.slice(Math.max(0, m.index - 400), m.index + 1200).replace(/\s+/g, ' '));
  }
  const page = await retry(() => fetchRaw('/indices-div-discount', undefined, false));
  const b = page.slice(page.indexOf('<body'));
  const i = b.search(/div-discount|Discount/i);
  console.log('\nPAGE BODY tail', b.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\s+/g, ' ').slice(-6000));
})();
