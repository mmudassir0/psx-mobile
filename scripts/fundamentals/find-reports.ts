/**
 * Lists each company's latest financial report PDFs from its PSX company page.
 * Usage: tsx find-reports.ts [SYMBOL ...]   (no symbols = all KSE-100 constituents)
 * Prints JSON: [{ symbol, sector, reports: [{ kind, period, date, title, url }] }]
 */
import { fetchCompany, fetchIndexConstituents } from '../../src/psx/api';

export type ReportKind = 'annual' | 'quarterly' | 'results';

export function classify(title: string): ReportKind | null {
  const t = title.toLowerCase();
  if (!/report|result|accounts|financial statement/.test(t)) return null;
  if (/transmission of (the )?annual report|annual report/.test(t)) return 'annual';
  if (/transmission of (the )?(quarterly|half[- ]?yearly|interim|condensed)|(quarterly|half[- ]?yearly) report/.test(t)) return 'quarterly';
  if (/financial results?/.test(t)) return 'results';
  return null;
}

async function main() {
  let symbols = process.argv.slice(2);
  if (!symbols.length) symbols = (await fetchIndexConstituents('KSE100')).map((c) => c.symbol);
  const out = [];
  for (const symbol of symbols) {
    try {
      const co = await fetchCompany(symbol);
      const reports = co.announcements
        .filter((a) => a.url && a.category === 'Financial Results')
        .map((a) => ({ kind: classify(a.title), date: a.date, title: a.title, url: a.url as string }))
        .filter((r) => r.kind != null);
      out.push({ symbol, sector: co.sector, shares: co.shares, reports });
    } catch (e) {
      out.push({ symbol, error: (e as Error).message, reports: [] });
    }
    await new Promise((r) => setTimeout(r, 400)); // be gentle with PSX
  }
  console.log(JSON.stringify(out, null, 1));
}

if (require.main === module) main();
