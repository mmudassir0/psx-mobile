/** Can old dividends be read from PSX announcements? Lists dividend notices and reads a few PDFs (text, else OCR). */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { fetchRaw } from '../src/psx/api';
async function retry<T>(f: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } }
  throw last;
}
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
mkdirSync('/tmp/pdf', { recursive: true });
function textOf(file: string): { text: string; ocr: boolean } {
  let t = '';
  try { t = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 30000 }); } catch {}
  if (t.replace(/\s/g, '').length > 80) return { text: t, ocr: false };
  try {
    execFileSync('pdftoppm', ['-r', '200', '-png', '-f', '1', '-l', '2', file, '/tmp/pdf/pg'], { timeout: 60000 });
    let all = '';
    for (const p of ['/tmp/pdf/pg-1.png', '/tmp/pdf/pg-2.png', '/tmp/pdf/pg-01.png', '/tmp/pdf/pg-02.png'])
      try { all += execFileSync('tesseract', [p, '-'], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
    return { text: all, ocr: true };
  } catch { return { text: '', ocr: true }; }
}
(async () => {
  for (const sym of ['FFC', 'LUCK', 'HUBC', 'MEBL', 'OGDC', 'PSO', 'SYS', 'MARI', 'ENGRO', 'POL']) {
    try {
      const h = await retry(() => fetchRaw('/announcements', { type: 'C', symbol: sym, query: '', count: '500', offset: '0', date_from: '2016-10-01', date_to: '2024-12-31', page: 'annc' }));
      const rows = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => {
        const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
        return { date: strip(cells[0] ?? ''), title: strip(cells[4] ?? ''), pdf: (cells[5] ?? '').match(/document\/(\d+)\.pdf/)?.[1] ?? null };
      }).filter((r) => r.title);
      const div = rows.filter((r) => /dividend|financial result|board meeting|book closure|payout|entitlement/i.test(r.title));
      console.log(`\n### ${sym}: ${rows.length} announcements, ${div.length} about results/dividends, total says ${h.match(/of (\d+) entries/)?.[1]}`);
      console.log(div.slice(0, 25).map((r) => `${r.date} | ${r.title} | ${r.pdf ?? '-'}`).join('\n'));
      let n = 0;
      for (const r of div.filter((x) => x.pdf && /result|dividend/i.test(x.title))) {
        if (n++ >= 3) break;
        const res = await fetch(`https://dps.psx.com.pk/download/document/${r.pdf}.pdf`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const buf = Buffer.from(await res.arrayBuffer());
        const f = `/tmp/pdf/${r.pdf}.pdf`;
        writeFileSync(f, buf);
        const { text, ocr } = textOf(f);
        const hits = [...text.matchAll(/[^\n]{0,160}(dividend|per share|book|closed)[^\n]{0,160}/gi)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 8);
        console.log(`  -- ${r.date} ${r.title} [${buf.length} bytes, ${ocr ? 'OCR' : 'text'}]\n     ${hits.join('\n     ')}`);
      }
    } catch (e) { console.log(sym, 'ERR', (e as Error).message); }
  }
})();
