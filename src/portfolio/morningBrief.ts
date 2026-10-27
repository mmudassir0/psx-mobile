/**
 * One short notification before the market opens, written on the phone from what
 * Sahm already knows: book closures and last days to buy for your holdings,
 * results expected, your notes due for a look, and price lines that were close
 * at the last close. Nothing worth saying → no notification that day.
 */

export interface BriefHolding {
  symbol: string;
  /** next payout not yet past */
  payout: { bookClosure: number; lastBuyDay: number; dps: number; bonusPct: number } | null;
  /** expected results day, YYYY-MM-DD, and whether a board meeting is called */
  results: { expected: string; meeting: string | null; label: string } | null;
}

export interface BriefLine {
  text: string;
  /** higher first */
  weight: number;
}

const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (d: string, today: string) => {
  if (d === today) return 'today';
  const next = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  if (d === next) return 'tomorrow';
  return DOW[new Date(d + 'T12:00:00Z').getUTCDay()];
};
const plusDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export function morningLines(input: {
  day: string;
  holdings: BriefHolding[];
  /** notes due on or before this day */
  notesDue: string[];
  /** price lines: symbol, line, last close, direction */
  lines?: { symbol: string; level: number; close: number; dir: '<' | '>' }[];
  /** e.g. a rate decision or holiday today */
  events?: string[];
}): BriefLine[] {
  const { day } = input;
  const out: BriefLine[] = [];
  for (const h of input.holdings) {
    const p = h.payout;
    if (p) {
      const buy = pk(p.lastBuyDay);
      const bc = pk(p.bookClosure);
      const what = p.dps > 0 ? `Rs ${p.dps.toFixed(2)} dividend` : `${p.bonusPct}% bonus`;
      if (buy === day) out.push({ text: `${h.symbol}: last day to buy for its ${what}`, weight: 5 });
      else if (bc >= day && bc <= plusDays(day, 3)) out.push({ text: `${h.symbol}: book closure ${dayName(bc, day)} (${what})`, weight: 3 });
    }
    const r = h.results;
    if (r) {
      if (r.meeting && r.meeting >= day && r.meeting <= plusDays(day, 1)) out.push({ text: `${h.symbol}: board meets ${dayName(r.meeting, day)} for ${r.label} results`, weight: 4 });
      else if (!r.meeting && r.expected === day) out.push({ text: `${h.symbol}: ${r.label} results may come today`, weight: 2 });
    }
  }
  for (const s of input.notesDue) out.push({ text: `Look again at ${s} (your note)`, weight: 2 });
  for (const l of input.lines ?? []) {
    const gap = Math.abs(l.close / l.level - 1);
    if (gap <= 0.03 && (l.dir === '<' ? l.close > l.level : l.close < l.level)) out.push({ text: `${l.symbol} closed ${(gap * 100).toFixed(1)}% from your Rs ${l.level} line`, weight: 3 });
  }
  for (const e of input.events ?? []) out.push({ text: e, weight: 4 });
  return out.sort((a, b) => b.weight - a.weight);
}

export function morningText(lines: BriefLine[], max = 4): { title: string; body: string } | null {
  if (!lines.length) return null;
  const shown = lines.slice(0, max).map((l) => l.text);
  const more = lines.length - shown.length;
  return { title: lines.length === 1 ? 'Before the market opens' : `Before the market opens: ${lines.length} things`, body: shown.join('\n') + (more > 0 ? `\n+${more} more` : '') };
}

/** The next `n` trading days from `from` (inclusive), YYYY-MM-DD. */
export function nextTradingDays(from: string, n: number, isTrading: (day: string) => boolean): string[] {
  const out: string[] = [];
  for (let d = from, k = 0; out.length < n && k < 30; d = plusDays(d, 1), k++) if (isTrading(d)) out.push(d);
  return out;
}
