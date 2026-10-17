/** Checks PSX's price-return KSE-100 series and how it compares with KSE-100. */
import { fetchSeries, fetchIndices } from '../src/psx/api';
(async () => {
  for (const code of ['KSE100PR', 'KSE100']) {
    try {
      const s = await fetchSeries('eod', code);
      const d = (t: number) => new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
      console.log(code, s.length, s.length ? `${d(s[0].t)} → ${d(s[s.length - 1].t)} last ${s[s.length - 1].v}` : '');
      if (s.length > 250) console.log('  1y change', (s[s.length - 1].v / s[s.length - 251].v - 1).toFixed(4));
    } catch (e) {
      console.log(code, 'error', (e as Error).message);
    }
  }
  const idx = await fetchIndices().catch(() => []);
  console.log('indices:', idx.map((i) => i.code).join(','));
})();
