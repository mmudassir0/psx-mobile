/** Reads old KMI All Share recomposition notices: their links and what the attachments say. */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fetchRaw } from '../src/psx/api';
(async () => {
  const h = await fetchRaw('/announcements', { type: 'E', symbol: '', query: 'KMI', count: '100', offset: '0', date_from: '2016-01-01', date_to: '2026-10-28', page: 'annc' });
  const rows = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  console.log(rows[1].slice(0, 1500));
  const links = [...new Set([...h.matchAll(/(?:href|data-images)="([^"]+)"/g)].map((m) => m[1]))].slice(0, 30);
  console.log('\nLINKS', links.join('\n'));
  // try the first two attachments of all-share recompositions
  let n = 0;
  for (const r of rows.filter((x) => /ALL SHARE/i.test(x))) {
    const l = r.match(/href="(\/download\/[^"]+)"/)?.[1] ?? r.match(/data-images="([^"]+)"/)?.[1];
    console.log('\nROW', r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120), '->', l);
    if (!l || n++ > 3) continue;
    const url = l.startsWith('/') ? `https://dps.psx.com.pk${l}` : `https://dps.psx.com.pk/download/image/${l}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(' got', res.status, res.headers.get('content-type'), buf.length);
    if ((res.headers.get('content-type') ?? '').includes('pdf')) {
      writeFileSync('/tmp/k.pdf', buf);
      const t = execFileSync('pdftotext', ['-layout', '/tmp/k.pdf', '-'], { encoding: 'utf8' });
      console.log(' TEXT', t.length, t.slice(0, 2500));
    }
  }
})().catch((e) => console.log('ERR', e));
