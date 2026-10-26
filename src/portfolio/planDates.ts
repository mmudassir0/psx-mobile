/** Dates for the monthly investing plan (no phone APIs, so the tests can use them). */
import { PSX_HOLIDAYS } from '../analysis/events';

export interface MonthlyPlan {
  on: boolean;
  /** Rs each month */
  amount: number;
  /** day of the month, 1–28 */
  day: number;
  /** the last month marked done, YYYY-MM */
  doneMonth: string | null;
}

export const NO_PLAN: MonthlyPlan = { on: false, amount: 20000, day: 5, doneMonth: null };

const HOLIDAYS = new Set(PSX_HOLIDAYS.map(([d]) => d));
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const pkDate = (t: number) => new Date(t + 5 * 3600_000);

/** The plan's day in a month, moved to the next trading day when it falls on a weekend or PSX holiday. */
export function planDayIn(year: number, month: number, day: number): string {
  let d = new Date(Date.UTC(year, month, day));
  while ([0, 6].includes(d.getUTCDay()) || HOLIDAYS.has(d.toISOString().slice(0, 10))) d = new Date(d.getTime() + 864e5);
  return d.toISOString().slice(0, 10);
}

/** The next `n` plan days from today (today included when it is one). */
export function nextPlanDays(day: number, now = Date.now(), n = 3): string[] {
  const p = pkDate(now);
  const today = p.toISOString().slice(0, 10);
  const out: string[] = [];
  for (let k = 0; out.length < n && k < n + 2; k++) {
    const d = planDayIn(p.getUTCFullYear(), p.getUTCMonth() + k, day);
    if (d >= today) out.push(d);
  }
  return out;
}

/** This month's plan day has come and the month isn't marked done. */
export function planDue(plan: MonthlyPlan, now = Date.now()): boolean {
  if (!plan.on || !(plan.amount > 0)) return false;
  const p = pkDate(now);
  const month = p.toISOString().slice(0, 7);
  return plan.doneMonth !== month && p.toISOString().slice(0, 10) >= planDayIn(p.getUTCFullYear(), p.getUTCMonth(), plan.day);
}

export const thisMonth = (now = Date.now()) => pkDate(now).toISOString().slice(0, 7);
export { iso as isoDay };
