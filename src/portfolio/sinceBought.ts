/**
 * Each holding since you bought it: the price then and now, the best and worst
 * close since, and how far it is from its best. The start is your first recorded
 * buy (after the last time you held none), or the first day Sahm saw it.
 */
import type { Candle } from '../psx/types';

export interface SinceBought {
  symbol: string;
  from: string | null;
  /** how the start day was found */
  basis: 'trade' | 'snapshot' | null;
  startPrice: number | null;
  avgCost: number;
  price: number;
  best: { price: number; day: string } | null;
  worst: { price: number; day: string } | null;
  /** below the best close since, 0–1 (0 at the best) */
  offBest: number | null;
  /** change since the start day's close */
  sinceStart: number | null;
  /** change against your average cost */
  onCost: number;
}

const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function startDay(symbol: string, trades: { day: string; symbol: string; side: 'buy' | 'sell'; shares: number }[], snapDays: { day: string; has: boolean }[]): { day: string; basis: 'trade' | 'snapshot' } | null {
  const mine = trades.filter((t) => t.symbol === symbol).sort((a, b) => (a.day < b.day ? -1 : 1));
  let held = 0;
  let start: string | null = null;
  for (const t of mine) {
    const before = held;
    held += t.side === 'buy' ? t.shares : -t.shares;
    if (before <= 0 && t.side === 'buy') start = t.day;
    if (held <= 0) start = null;
  }
  if (start) return { day: start, basis: 'trade' };
  // the first day of the latest run of snapshots holding it
  let first: string | null = null;
  for (const s of snapDays) {
    if (s.has && !first) first = s.day;
    if (!s.has) first = null;
  }
  return first ? { day: first, basis: 'snapshot' } : null;
}

export function sinceBought(input: { symbol: string; candles: Candle[]; start: { day: string; basis: 'trade' | 'snapshot' } | null; avgCost: number; price: number }): SinceBought {
  const { candles, start, avgCost, price } = input;
  const base: SinceBought = {
    symbol: input.symbol,
    from: start?.day ?? null,
    basis: start?.basis ?? null,
    startPrice: null,
    avgCost,
    price,
    best: null,
    worst: null,
    offBest: null,
    sinceStart: null,
    onCost: avgCost > 0 ? price / avgCost - 1 : 0,
  };
  if (!start || !candles.length) return base;
  const span = candles.filter((c) => pk(c.t) >= start.day);
  if (!span.length) return base;
  let best = span[0];
  let worst = span[0];
  for (const c of span) {
    if (c.c > best.c) best = c;
    if (c.c < worst.c) worst = c;
  }
  const hi = Math.max(best.c, price);
  return {
    ...base,
    startPrice: span[0].c,
    best: { price: best.c, day: pk(best.t) },
    worst: { price: worst.c, day: pk(worst.t) },
    offBest: hi > 0 ? 1 - price / hi : null,
    sinceStart: span[0].c > 0 ? price / span[0].c - 1 : null,
  };
}
