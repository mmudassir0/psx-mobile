/**
 * Who was Shariah-compliant (in the KMI All Share index) and in the KMI-30 on
 * each date since 2017, from PSX's recomposition notices, so the backtesting
 * lab doesn't judge 2019 with today's Shariah list.
 *   tsx scripts/kmi-history.ts <out file>
 */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { fetchIndexConstituents, fetchRaw } from '../src/psx/api';
import { membershipHistory, parseIndexNotice, spansOf, type IndexEvent } from '../src/lab/kmiText';

const out = process.argv[2] ?? '/tmp/out/kmi.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const day = (s: string) => {
  const m = s.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
  return m ? `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}` : null;
};

async function main() {
  mkdirSync('/tmp/kmi', { recursive: true });
  const notices = new Map<string, { day: string; title: string }>();
  for (const query of ['recomposition', 're-composition', 'KMI']) {
    const h = await fetchRaw('/announcements', { type: 'E', symbol: '', query, count: '100', offset: '0', date_from: '2016-01-01', date_to: '2030-12-31', page: 'annc' });
    for (const m of h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
        c[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      const link = m[1].match(/href="(\/download\/attachment\/[^"]+\.pdf)"/)?.[1];
      const d = day(cells[0] ?? '');
      if (link && d) notices.set(link, { day: d, title: cells[2] ?? '' });
    }
    await sleep(500);
  }
  const events: Record<'kmiall' | 'kmi30', IndexEvent[]> = { kmiall: [], kmi30: [] };
  let read = 0,
    scanned = 0;
  for (const [link, n] of [...notices].sort((a, b) => (a[1].day < b[1].day ? -1 : 1))) {
    const which = /ALL\s*SHARE/i.test(n.title) ? 'kmiall' : /KMI[\s-]*30|MEEZAN\s*30/i.test(n.title) ? 'kmi30' : null;
    if (!which || /MAHAANA|methodology|corrigendum/i.test(n.title)) continue;
    try {
      const res = await fetch(`https://dps.psx.com.pk${link}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Sahm lab data)' }, signal: AbortSignal.timeout(60_000) });
      writeFileSync('/tmp/kmi/n.pdf', Buffer.from(await res.arrayBuffer()));
      const text = execFileSync('pdftotext', ['-layout', '/tmp/kmi/n.pdf', '-'], { encoding: 'utf8', maxBuffer: 2e7 });
      if (text.replace(/\s/g, '').length < 200) {
        scanned++;
        continue;
      }
      const e = parseIndexNotice(text, n.day);
      if (e) {
        events[which].push(e);
        read++;
        console.log(`${which} ${n.day} → ${e.date}: +${e.in.length} −${e.out.length}${e.full ? `, full list ${e.full.length}` : ''} (says ${JSON.stringify(e.stated)})`);
      }
    } catch (err) {
      console.log(`${n.day} ${n.title.slice(0, 50)}: ${(err as Error).message}`);
    }
    await sleep(400);
  }
  const now = {
    kmiall: (await fetchIndexConstituents('KMIALLSHR')).map((c) => c.symbol),
    kmi30: (await fetchIndexConstituents('KMI30')).map((c) => c.symbol),
  };
  const result: Record<string, unknown> = { built: new Date().toISOString().slice(0, 10), events, now };
  for (const k of ['kmiall', 'kmi30'] as const) {
    const hist = membershipHistory(now[k], events[k]);
    result[k] = { from: events[k].map((e) => e.date).sort()[0] ?? null, spans: Object.fromEntries(spansOf(hist)) };
  }
  writeFileSync(out, JSON.stringify(result));
  console.log(`read ${read} notices (${scanned} scanned ones skipped); KMI All Share from ${(result.kmiall as { from: string }).from}, KMI-30 from ${(result.kmi30 as { from: string }).from}`);
}
main().catch((e) => {
  console.log('kmi history failed:', (e as Error).message);
});
