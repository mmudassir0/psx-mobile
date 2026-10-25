/**
 * A savings goal: reach a target value by a date. Works out the monthly amount
 * needed at an assumed yearly return, and where the current monthly amount
 * would get you. Amounts are in future rupees (no inflation adjustment).
 */
import { makePref } from '../prefs';

export interface Goal {
  target: number;
  /** YYYY-MM the target should be reached by */
  by: string;
  /** assumed yearly return, e.g. 0.15 */
  rate: number;
}

export const goalPref = makePref<Goal | null>('real.goal', null);

/** Whole months from now until the end of the target month. */
export function monthsUntil(by: string, now = Date.now()): number {
  const [y, m] = by.split('-').map(Number);
  const d = new Date(now + 5 * 3600_000);
  return Math.max(0, (y - d.getUTCFullYear()) * 12 + (m - 1 - d.getUTCMonth()));
}

const monthly = (rate: number) => Math.pow(1 + rate, 1 / 12) - 1;

/** Value after n months, starting at `now` and adding `add` at the end of each month. */
export function project(now: number, add: number, rate: number, n: number): number {
  const i = monthly(rate);
  if (n <= 0) return now;
  if (Math.abs(i) < 1e-12) return now + add * n;
  const g = Math.pow(1 + i, n);
  return now * g + add * ((g - 1) / i);
}

/** Monthly amount needed to reach `target` from `now` in n months. 0 if already on course with nothing added. */
export function needed(now: number, target: number, rate: number, n: number): number {
  if (n <= 0) return Math.max(0, target - now);
  const i = monthly(rate);
  const g = Math.pow(1 + i, n);
  const gap = target - now * g;
  if (gap <= 0) return 0;
  return Math.abs(i) < 1e-12 ? gap / n : (gap * i) / (g - 1);
}

export interface GoalStatus {
  months: number;
  need: number;
  /** where the current monthly amount gets you by then */
  reach: number | null;
  onTrack: boolean | null;
  /** what the target is worth in today's money at 8% yearly inflation, as a reminder */
  realTarget: number;
}

export const INFLATION_GUESS = 0.08;

export function goalStatus(g: Goal, value: number, perMonth: number | null, now = Date.now()): GoalStatus {
  const months = monthsUntil(g.by, now);
  const need = needed(value, g.target, g.rate, months);
  const reach = perMonth != null ? project(value, perMonth, g.rate, months) : null;
  return {
    months,
    need,
    reach,
    onTrack: reach == null ? null : reach >= g.target,
    realTarget: g.target / Math.pow(1 + INFLATION_GUESS, months / 12),
  };
}
