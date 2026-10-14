/**
 * Support and resistance from swing points.
 *
 * A swing high is a bar whose high is the highest of `k` bars on each side
 * (swing low likewise). Nearby swings (within `tol` of each other) are merged
 * into one level, and a level touched more often is stronger.
 */
import type { Candle } from '../psx/types';

export interface Level {
  price: number;
  /** how many swing points formed this level */
  touches: number;
  kind: 'support' | 'resistance';
}

export interface Levels {
  support: Level | null;
  resistance: Level | null;
  all: Level[];
}

function swings(c: Candle[], k: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < c.length - k; i++) {
    let hi = true;
    let lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (c[j].h >= c[i].h) hi = false;
      if (c[j].l <= c[i].l) lo = false;
    }
    if (hi) highs.push(c[i].h);
    if (lo) lows.push(c[i].l);
  }
  return { highs, lows };
}

function cluster(points: number[], tol: number): { price: number; touches: number }[] {
  const sorted = [...points].sort((a, b) => a - b);
  const out: { price: number; touches: number; sum: number }[] = [];
  for (const p of sorted) {
    const g = out[out.length - 1];
    if (g && Math.abs(p - g.price) / g.price <= tol) {
      g.sum += p;
      g.touches += 1;
      g.price = g.sum / g.touches;
    } else {
      out.push({ price: p, touches: 1, sum: p });
    }
  }
  return out.map(({ price, touches }) => ({ price, touches }));
}

/** Levels from the last `lookback` bars, relative to `price` (defaults to the last close). */
export function findLevels(c: Candle[], price?: number, lookback = 250, k = 3, tol = 0.015): Levels {
  const recent = c.slice(-lookback);
  if (recent.length < 2 * k + 1) return { support: null, resistance: null, all: [] };
  const p = price ?? recent[recent.length - 1].c;
  const { highs, lows } = swings(recent, k);
  const levels = cluster([...highs, ...lows], tol).map((l) => ({
    ...l,
    kind: (l.price < p ? 'support' : 'resistance') as Level['kind'],
  }));
  // Nearest level below and above, ignoring ones within 0.5% of price (price is sitting on them).
  const below = levels.filter((l) => l.price < p * 0.995).sort((a, b) => b.price - a.price);
  const above = levels.filter((l) => l.price > p * 1.005).sort((a, b) => a.price - b.price);
  return { support: below[0] ?? null, resistance: above[0] ?? null, all: levels };
}
