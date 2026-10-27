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

export interface LineCross {
  key: string;
  what: string;
  dir: 'above' | 'below';
  value: number;
}

/** Lines the last close crossed (the close before was on the other side). */
export function crossings(c: Candle[], l: UserLines): LineCross[] {
  if (c.length < 2) return [];
  const a = c[c.length - 2];
  const b = c[c.length - 1];
  const day = new Date(b.t + 5 * 3600_000).toISOString().slice(0, 10);
  const out: LineCross[] = [];
  const check = (v0: number, v1: number, what: string, id: string) => {
    if (a.c >= v0 && b.c < v1) out.push({ key: `${id}:${day}`, what, dir: 'below', value: v1 });
    else if (a.c <= v0 && b.c > v1) out.push({ key: `${id}:${day}`, what, dir: 'above', value: v1 });
  };
  for (const lv of l.levels) check(lv.price, lv.price, `your line at Rs ${lv.price.toFixed(2)}`, `L${lv.price}`);
  for (const t of l.trends) {
    if (a.t < t.t1) continue;
    const v = trendValues([a, b], t);
    if (v[0] != null && v[1] != null) check(v[0], v[1], t.kind === 'lows' ? 'your line under the lows' : 'your line over the highs', `T${t.kind}${t.t1}`);
  }
  return out;
}
