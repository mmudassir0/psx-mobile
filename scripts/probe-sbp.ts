/** Probe: SBP pages with interest rate history, as text, to see what the daily job can read. */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const URLS = [
  'https://www.sbp.org.pk/ecodata/OVR-Repo-History.pdf',
  'https://archive.sbp.org.pk/ecodata/OVR-Repo-History.pdf',
  'https://www.sbp.org.pk/ecodata/auction-tbills.pdf',
  'https://www.sbp.org.pk/ecodata/Auction-TBills-Arch.pdf',
  'https://www.sbp.org.pk/ecodata/MTB-Auction-History.pdf',
];

(async () => {
  for (const u of URLS) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`=== ${u} ${r.status} ${r.headers.get('content-type')} ${buf.length} bytes`);
      if (!r.ok) continue;
      if (buf.subarray(0, 4).toString() === '%PDF') {
        writeFileSync('/tmp/x.pdf', buf);
        const txt = execFileSync('pdftotext', ['-layout', '/tmp/x.pdf', '-'], { encoding: 'utf8' });
        const lines = txt.split('\n').filter((l) => l.trim());
        console.log(`${lines.length} lines`);
        console.log(lines.slice(0, 40).join('\n'));
        console.log('...');
        console.log(lines.slice(-25).join('\n'));
      } else console.log(buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
    } catch (e) {
      console.log(`=== ${u} failed: ${(e as Error).message}`);
    }
  }
})();
