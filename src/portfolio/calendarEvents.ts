/** The dates worth having in your phone's calendar: for each holding, the last day to buy for a payout, book closure and results; and the State Bank's rate decisions. */

export interface CalHolding {
  symbol: string;
  payouts: { bookClosure: number; lastBuyDay: number; dps: number; bonusPct: number }[];
  results: { expected: string; meeting: string | null; label: string; basis: 'last year' | 'deadline' } | null;
}

export interface CalEvent {
  /** stable, to compare with what's already in the calendar */
  key: string;
  title: string;
  /** YYYY-MM-DD, all day */
  day: string;
  notes: string;
}

const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function calendarEvents(holdings: CalHolding[], today: string, mpc: string[], until?: string): CalEvent[] {
  const end = until ?? new Date(Date.parse(today + 'T12:00:00Z') + 366 * 864e5).toISOString().slice(0, 10);
  const out: CalEvent[] = [];
  const add = (e: CalEvent) => {
    if (e.day >= today && e.day <= end && !out.some((x) => x.key === e.key)) out.push(e);
  };
  for (const h of holdings) {
    for (const p of h.payouts) {
      const what = [p.dps > 0 ? `Rs ${p.dps.toFixed(2)} a share dividend` : null, p.bonusPct > 0 ? `${p.bonusPct}% bonus shares` : null].filter(Boolean).join(' and ');
      if (!what) continue;
      const bc = pk(p.bookClosure);
      add({
        key: `buy:${h.symbol}:${bc}`,
        title: `${h.symbol}: last day to buy for its payout`,
        day: pk(p.lastBuyDay),
        notes: `${what}. Shares bought after today don't qualify (PSX settles the next working day). From Sahm.`,
      });
      add({
        key: `bc:${h.symbol}:${bc}`,
        title: `${h.symbol}: book closure`,
        day: bc,
        notes: `${what}. Cash dividends usually reach your bank within a few weeks of book closure. From Sahm.`,
      });
    }
    const r = h.results;
    if (r) {
      if (r.meeting)
        add({ key: `bm:${h.symbol}:${r.meeting}`, title: `${h.symbol}: board meeting (${r.label} results)`, day: r.meeting, notes: 'Results, and any dividend, are usually announced the same day. From Sahm.' });
      else
        add({
          key: `res:${h.symbol}:${r.expected}`,
          title: `${h.symbol}: ${r.label} results likely`,
          day: r.expected,
          notes: `${r.basis === 'last year' ? 'Around when they came last year' : 'The latest date PSX allows'}; the exact day comes with the board meeting notice. From Sahm.`,
        });
    }
  }
  for (const d of mpc) add({ key: `mpc:${d}`, title: 'State Bank rate decision', day: d, notes: 'The policy rate is announced; shares often move more than usual. From Sahm.' });
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.title.localeCompare(b.title)));
}

/** A short fingerprint, so the calendar is only rewritten when the dates change. */
export const eventsSig = (e: CalEvent[]) => e.map((x) => `${x.key}|${x.day}`).join(';');
