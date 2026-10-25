/**
 * The monthly summary: how your real portfolio did over a calendar month,
 * from the daily snapshots (track.ts), against the KSE-100 over the same days.
 */
import type { SeriesPoint } from '../psx/types';
import { flowBetween, indexReturns, trackReturns, type Snap } from './track';

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  /** first and last snapshot days used */
  from: string;
  to: string;
  /** true when tracking began during this month */
  partial: boolean;
  startValue: number;
  endValue: number;
  /** time-weighted return over the month (money in or out excluded) */
  ret: number;
  index: number | null;
  /** money you put in (+) or took out (−) */
  flow: number;
  /** gross cash dividends earned (ex-dates in the month) */
  dividends: number;
  /** holdings' price change over the month, best first */
  movers: { symbol: string; change: number }[];
}

export const monthOf = (day: string) => day.slice(0, 7);

/** The month before the one containing `now` (Pakistan time). */
export function lastMonth(now = Date.now()): string {
  const d = new Date(now + 5 * 3600_000);
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth();
  return `${y}-${String(m).padStart(2, '0')}`;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function summarizeMonth(snaps: Snap[], month: string, index: SeriesPoint[] | null): MonthSummary | null {
  const inMonth = snaps.filter((s) => monthOf(s.day) === month);
  if (!inMonth.length) return null;
  // start from the last snapshot of the month before, when there is one
  const before = snaps.filter((s) => s.day < `${month}-01`);
  const start = before.length ? before[before.length - 1] : inMonth[0];
  const used = [start, ...inMonth.filter((s) => s !== start)];
  if (used.length < 2) return null;
  const pts = trackReturns(used);
  const end = used[used.length - 1];
  let flow = 0;
  for (let i = 1; i < used.length; i++) flow += flowBetween(used[i - 1], used[i]);
  const dividends = used.slice(1).reduce((a, s) => a + s.div, 0);
  const ir = index ? indexReturns(index, [start.day, end.day]) : null;
  const movers = Object.keys(end.pos)
    .filter((s) => start.pos[s])
    .map((s) => ({ symbol: s, change: end.pos[s][2] / start.pos[s][2] - 1 }))
    .filter((x) => Number.isFinite(x.change))
    .sort((a, b) => b.change - a.change);
  return {
    month,
    from: start.day,
    to: end.day,
    partial: !before.length,
    startValue: start.value,
    endValue: end.value,
    ret: pts[pts.length - 1].ret,
    index: ir?.[1] ?? null,
    flow,
    dividends,
    movers,
  };
}

/** Yearly return implied by the tracked history, once there are at least `minDays` days of it. */
export function trackedYearly(snaps: Snap[], minDays = 180): number | null {
  if (snaps.length < 2) return null;
  const days = (Date.parse(snaps[snaps.length - 1].day) - Date.parse(snaps[0].day)) / 864e5;
  if (days < minDays) return null;
  const r = trackReturns(snaps);
  return Math.pow(1 + r[r.length - 1].ret, 365 / days) - 1;
}
