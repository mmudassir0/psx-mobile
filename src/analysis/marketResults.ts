/**
 * The whole market's results season, from the daily job: board meetings called
 * (results usually within days), results just out, and results likely in the
 * next weeks, for the KSE-100 and KMI-30 companies.
 */
export type ResultsRow = [symbol: string, kind: 'meeting' | 'out' | 'due', day: string, label: string];

export interface ResultsFeed {
  v: 1;
  kind: 'results';
  day: string;
  generatedAt: string;
  checked: number;
  rows: ResultsRow[];
}

export const isResultsFeed = (x: unknown): x is ResultsFeed => {
  const f = x as ResultsFeed | null;
  return !!f && f.v === 1 && f.kind === 'results' && Array.isArray(f.rows);
};

/** Rows to show: meetings and results from the last two weeks, and what's due in the next four. */
export function resultsWindow(f: ResultsFeed, today: string): { meetings: ResultsRow[]; out: ResultsRow[]; due: ResultsRow[] } {
  const add = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const from = add(today, -14);
  const to = add(today, 28);
  const meetings = f.rows.filter((r) => r[1] === 'meeting' && r[2] >= from).sort((a, b) => (a[2] < b[2] ? 1 : -1));
  const out = f.rows.filter((r) => r[1] === 'out' && r[2] >= from).sort((a, b) => (a[2] < b[2] ? 1 : -1));
  const met = new Set([...meetings, ...out].map((r) => r[0]));
  const due = f.rows.filter((r) => r[1] === 'due' && r[2] >= today && r[2] <= to && !met.has(r[0])).sort((a, b) => (a[2] < b[2] ? -1 : 1));
  return { meetings, out, due };
}
