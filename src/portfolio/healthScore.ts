/**
 * A health score out of 100 from the health check (each red point costs 15, each
 * amber 6), with how spread your money is ("like owning N stocks equally":
 * 1 ÷ the sum of squared weights). One entry a week is kept, to see the trend.
 */
import type { HealthItem } from './health';

export interface HealthPoint {
  /** Monday of the week, YYYY-MM-DD */
  week: string;
  score: number;
  /** effective number of stocks */
  spread: number;
  /** biggest holding's share, 0–1 */
  top: number;
}

export function healthScore(items: Pick<HealthItem, 'level'>[]): number {
  const bad = items.filter((i) => i.level === 'bad').length;
  const warn = items.filter((i) => i.level === 'warn').length;
  return Math.max(0, Math.min(100, 100 - 15 * bad - 6 * warn));
}

export function spreadOf(values: number[]): { spread: number; top: number } {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (!total) return { spread: 0, top: 0 };
  const w = values.map((v) => Math.max(0, v) / total);
  return { spread: 1 / w.reduce((a, x) => a + x * x, 0), top: Math.max(...w) };
}

export function weekOf(day: string): string {
  const d = new Date(day + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 864e5).toISOString().slice(0, 10);
}

/** Adds (or replaces) this week's point; keeps two years. */
export function addPoint(list: HealthPoint[], p: HealthPoint): HealthPoint[] {
  const same = list.length && list[list.length - 1].week === p.week;
  const next = same ? [...list.slice(0, -1), p] : [...list, p];
  return next.slice(-104);
}

/** The change against about a month ago (or the earliest point), for one line of text. */
export function trendLine(list: HealthPoint[]): string | null {
  if (list.length < 2) return null;
  const now = list[list.length - 1];
  const then = list[Math.max(0, list.length - 5)];
  const d = now.score - then.score;
  const weeks = list.length - 1 - Math.max(0, list.length - 5);
  if (d === 0) return `Same as ${weeks} week${weeks === 1 ? '' : 's'} ago.`;
  return `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} from ${then.score} ${weeks} week${weeks === 1 ? '' : 's'} ago: ${d > 0 ? 'better spread' : 'more concentrated'}.`;
}
