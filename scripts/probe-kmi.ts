/** Looks for old KMI index recomposition notices on PSX (constituent lists over the years). */
import { fetchRaw } from '../src/psx/api';
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
(async () => {
  for (const type of ['E', 'P', 'X', 'N']) {
    for (const query of ['KMI', 'Shariah', 'recomposition']) {
      try {
        const h = await fetchRaw('/announcements', { type, symbol: '', query, count: '100', offset: '0', date_from: '2016-01-01', date_to: '2026-10-28', page: 'annc' });
        const rows = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => {
          const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
          return `${strip(c[0] ?? '')} | ${strip(c.slice(2, -1).join(' | ')).slice(0, 140)} | ${(m[1].match(/document\/(\d+)\.pdf/) ?? [])[1] ?? '-'}`;
        });
        console.log(`\n== type ${type} query ${query}: ${h.match(/of (\d+) entries/)?.[1] ?? 0}`);
        console.log(rows.filter((r) => /kmi|shariah|islamic/i.test(r)).slice(0, 25).join('\n'));
      } catch (e) {
        console.log(type, query, (e as Error).message);
      }
    }
  }
})();
