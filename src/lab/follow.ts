/**
 * Following a lab strategy: on each of its check days (the first trading days of
 * a check month) Home lists what it would hold now and which of those you don't
 * own yet, and a reminder comes the morning of the next check. Pure parts here;
 * the hook is in useLabFollow.
 */
import type { Lab } from './data';
import { earliestYear, firstDayOf, type Strategy } from './engine';

export interface Follow {
  id: string;
  since: string;
}

/** Month count from the strategy's first month to `day`'s month. */
const monthsFrom = (lab: Lab, st: Strategy, day: string) => {
  const start = lab.days[firstDayOf(lab, Math.max(st.from, earliestYear(lab)))];
  const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  return ym(day) - ym(start);
};

/** Is `today` (YYYY-MM-DD) in the first week of one of the strategy's check months? */
export function checkDue(lab: Lab, st: Strategy, today: string): boolean {
  if (Number(today.slice(8, 10)) > 7) return false;
  return monthsFrom(lab, st, today) % st.every === 0;
}

/** The first day of the next check month after `today`, YYYY-MM-01. */
export function nextCheck(lab: Lab, st: Strategy, today: string): string {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let k = 0; k < 13; k++) {
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    const d = `${y}-${String(m).padStart(2, '0')}-01`;
    if (monthsFrom(lab, st, d) % st.every === 0) return d;
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** What the strategy holds now against what you own. */
export function followPlan(picks: string[], owned: string[]): { missing: string[]; owned: string[] } {
  const mine = new Set(owned);
  return { missing: picks.filter((s) => !mine.has(s)), owned: picks.filter((s) => mine.has(s)) };
}
