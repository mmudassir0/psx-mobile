/** Dates and comparisons for stock notes (no phone APIs, so the tests can use them). */
export const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** A review date `months` from `now`. */
export function inMonths(months: number, now = Date.now()): string {
  const d = new Date(now + 5 * 3600_000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Notes whose review date has come, oldest first. */
export function dueNotes(notes: Record<string, { checkOn: string | null }>, now = Date.now()): string[] {
  const today = pkDay(now);
  return Object.entries(notes)
    .filter(([, n]) => n.checkOn && n.checkOn <= today)
    .sort((a, b) => (a[1].checkOn! < b[1].checkOn! ? -1 : 1))
    .map(([s]) => s);
}

/** How a figure moved since the note: "12.0% → 7.1%". Null when either side is unknown. */
export function moved(then: number | null, now: number | null, fmt: (v: number) => string): string | null {
  if (then == null || now == null || !Number.isFinite(then) || !Number.isFinite(now)) return null;
  return `${fmt(then)} → ${fmt(now)}`;
}

