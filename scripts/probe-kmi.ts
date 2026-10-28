/** Dumps the text of old KMI recomposition notices (2017-2022) to see their layout. */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fetchRaw } from '../src/psx/api';
(async () => {
  const h = await fetchRaw('/announcements', { type: 'E', symbol: '', query: 'recomposition', count: '100', offset: '0', date_from: '2016-01-01', date_to: '2026-10-28', page: 'annc' });
  const rows = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]).filter((r) => /KMI|MEEZAN/i.test(r));
  for (const r of rows.filter((x) => /20(17|18|19|20|21|22)/.test(x)).slice(0, 8)) {
    const l = r.match(/href="(\/download\/[^"]+)"/)?.[1];
    console.log('\n\n######', r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140), l);
    if (!l) continue;
    const res = await fetch(`https://dps.psx.com.pk${l}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    writeFileSync('/tmp/k.pdf', Buffer.from(await res.arrayBuffer()));
    try {
      const t = execFileSync('pdftotext', ['-layout', '/tmp/k.pdf', '-'], { encoding: 'utf8' });
      console.log('TEXT', t.length, '\n', t.slice(0, 3000));
    } catch (e) { console.log('pdftotext failed'); }
  }
})().catch((e) => console.log('ERR', e));
