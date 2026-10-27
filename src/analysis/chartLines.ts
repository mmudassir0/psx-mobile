/**
 * Your own lines on a stock's chart: flat levels at a price, and trend lines
 * through two points (picked from the chart's recent swing lows or highs),
 * carried on to today. Saved per stock on the phone.
 */
import type { Candle } from '../psx/types';

export interface UserLevel {
  price: number;
}
export interface UserTrend {
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  kind: 'lows' | 'highs';
}
export interface UserLines {
  levels: UserLevel[];
  trends: UserTrend[];
}
export const NO_LINES: UserLines = { levels: [], trends: [] };

/** Turning points: a close lower (or higher) than the `k` closes on each side. */
export function swings(c: Candle[], kind: 'lows' | 'highs', k = 5): { t: number; p: number }[] {
  const out: { t: number; p: number }[] = [];
  for (let i = k; i < c.length - k; i++) {
    let ok = true;
    for (let j = i - k; j <= i + k && ok; j++) if (j !== i && (kind === 'lows' ? c[j].c < c[i].c : c[j].c > c[i].c)) ok = false;
    if (ok) out.push({ t: c[i].t, p: c[i].c });
  }
  return out;
}

/** A line through the two most recent swing points of the last `bars` days, or null when there aren't two. */
export function autoTrend(c: Candle[], kind: 'lows' | 'highs', bars = 250): UserTrend | null {
  const recent = c.slice(-bars);
  const s = swings(recent, kind);
  if (s.length < 2) return null;
  const [a, b] = s.slice(-2);
  return { t1: a.t, p1: a.p, t2: b.t, p2: b.p, kind };
}

/** The line's value at each candle, from its first point on (null before). */
export function trendValues(c: Candle[], l: UserTrend): (number | null)[] {
  const span = l.t2 - l.t1;
  if (!span) return c.map(() => null);
  return c.map((x) => (x.t < l.t1 ? null : l.p1 + ((l.p2 - l.p1) * (x.t - l.t1)) / span));
}

/** Where the line is today, and how far the price is from it. */
export function trendNow(c: Candle[], l: UserTrend): { value: number; gap: number } | null {
  const last = c[c.length - 1];
  if (!last || l.t2 === l.t1) return null;
  const value = l.p1 + ((l.p2 - l.p1) * (last.t - l.t1)) / (l.t2 - l.t1);
  return { value, gap: last.c / value - 1 };
}
