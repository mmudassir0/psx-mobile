/**
 * Lists each company's latest financial report PDFs from its PSX company page.
 * Usage: tsx find-reports.ts [SYMBOL ...]   (no symbols = all KSE-100 and KMI-30 members)
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

/** PSX sometimes drops connections from cloud runners; retry with backoff. */
async function retry<T>(f: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw last;
}

async function main() {
  let symbols = process.argv.slice(2);
  if (!symbols.length) {
    // KSE-100 and KMI-30 members: the stocks most people hold.
    const sets = await Promise.all(['KSE100', 'KMI30'].map((code) => retry(() => fetchIndexConstituents(code)).catch(() => [])));
    symbols = [...new Set(sets.flat().map((c) => c.symbol))];
  }
  const out = [];
  for (const symbol of symbols) {
    try {
      const co = await retry(() => fetchCompany(symbol));
      const reports = co.announcements
        .filter((a) => a.url && a.category === 'Financial Results')
        .map((a) => ({ kind: classify(a.title), date: a.date, title: a.title, url: a.url as string }))
        .filter((r) => r.kind != null);
      out.push({ symbol, sector: co.sector, shares: co.shares, reports });
    } catch (e) {
      out.push({ symbol, error: (e as Error).message, reports: [] });
    }
    await new Promise((r) => setTimeout(r, 1000)); // be gentle with PSX
  }
  console.log(JSON.stringify(out, null, 1));
}

if (require.main === module) main();
