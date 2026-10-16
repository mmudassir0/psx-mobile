/**
 * Stress test: how today's holdings behaved in the biggest past falls of the
 * KSE-100, and how much each tends to move with the index.
 * Uses only past prices; it can't predict the next shock, only show how these
 * stocks have reacted to earlier ones.
 */
import type { Candle, SeriesPoint } from '../psx/types';

export interface Episode {
  /** index peak and trough, epoch ms */
  peakT: number;
  troughT: number;
  /** index fall, e.g. -0.32 */
  fall: number;
  /** when the index got back to its peak, or null if it hasn't */
  recoveredT: number | null;
}

const DAY = 864e5;
const dayKey = (t: number) => Math.floor((t + 5 * 3600_000) / DAY);

/** Non-overlapping peak-to-trough falls of at least `min` (e.g. 0.15), biggest first. */
export function drawdowns(pts: SeriesPoint[], min = 0.15, max = 6): Episode[] {
  const p = pts.filter((x) => x.v > 0);
  const out: Episode[] = [];
  let peak = 0;
  let trough = 0;
  let inFall = false;
  const close = () => {
    const fall = p[trough].v / p[peak].v - 1;
    if (fall <= -min) {
      let r = trough;
      while (r < p.length && p[r].v < p[peak].v) r++;
      out.push({ peakT: p[peak].t, troughT: p[trough].t, fall, recoveredT: r < p.length ? p[r].t : null });
    }
  };
  for (let i = 1; i < p.length; i++) {
    if (p[i].v >= p[peak].v) {
      if (inFall) close();
      inFall = false;
      peak = i;
      trough = i;
    } else {
      inFall = true;
      if (p[i].v < p[trough].v) trough = i;
    }
  }
  if (inFall) close();
  return out.sort((a, b) => a.fall - b.fall).slice(0, max).sort((a, b) => a.peakT - b.peakT);
}

function closeOn(c: Candle[], t: number): { i: number; c: number } | null {
  // last bar on or before t
  let lo = 0, hi = c.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (c[m].t <= t + DAY / 2) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r >= 0 && t - c[r].t < 10 * DAY ? { i: r, c: c[r].c } : null;
}

export interface EpisodeResult {
  /** change from the index peak to the index trough */
  change: number;
  /** trading days after the trough until it got back to its peak-day price; null if not yet */
  recoveryDays: number | null;
}

export function inEpisode(c: Candle[], e: Episode): EpisodeResult | null {
  const a = closeOn(c, e.peakT);
  const b = closeOn(c, e.troughT);
  if (!a || !b || a.c <= 0) return null;
  let r = b.i;
  while (r < c.length && c[r].c < a.c) r++;
  return { change: b.c / a.c - 1, recoveryDays: r < c.length ? r - b.i : null };
}

/** How much the stock typically moves for a 1% move in the index (daily returns, last ~2 years). */
export function beta(c: Candle[], index: SeriesPoint[], days = 500): number | null {
  const ix = new Map(index.map((p) => [dayKey(p.t), p.v]));
  const pairs: [number, number][] = [];
  const recent = c.slice(-days - 1);
  for (let i = 1; i < recent.length; i++) {
    const a0 = ix.get(dayKey(recent[i - 1].t)), a1 = ix.get(dayKey(recent[i].t));
    if (!a0 || !a1 || recent[i - 1].c <= 0) continue;
    pairs.push([recent[i].c / recent[i - 1].c - 1, a1 / a0 - 1]);
  }
  if (pairs.length < 120) return null;
  const mx = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  const my = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  let cov = 0, vx = 0;
  for (const [y, x] of pairs) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) ** 2;
  }
  return vx > 0 ? cov / vx : null;
}

export interface StressHolding {
  symbol: string;
  value: number;
  candles: Candle[] | null;
}

export interface StressResult {
  /** value-weighted beta of the holdings that have one */
  beta: number | null;
  /** share of portfolio value with a beta */
  coverage: number;
  betas: { symbol: string; beta: number | null; weight: number }[];
  episodes: {
    e: Episode;
    /** today's portfolio, held through that fall (holdings without data left out) */
    portfolio: number | null;
    coverage: number;
    worst: { symbol: string; change: number } | null;
    best: { symbol: string; change: number } | null;
    rows: { symbol: string; r: EpisodeResult | null }[];
  }[];
}

export function stressTest(holdings: StressHolding[], index: SeriesPoint[]): StressResult {
  const total = holdings.reduce((a, h) => a + h.value, 0) || 1;
  const betas = holdings.map((h) => ({ symbol: h.symbol, beta: h.candles ? beta(h.candles, index) : null, weight: h.value / total }));
  const withB = betas.filter((b) => b.beta != null);
  const cov = withB.reduce((a, b) => a + b.weight, 0);
  const pb = cov > 0 ? withB.reduce((a, b) => a + (b.beta as number) * b.weight, 0) / cov : null;
  const episodes = drawdowns(index).map((e) => {
    const rows = holdings.map((h) => ({ symbol: h.symbol, value: h.value, r: h.candles ? inEpisode(h.candles, e) : null }));
    const known = rows.filter((x) => x.r);
    const kv = known.reduce((a, x) => a + x.value, 0);
    const portfolio = kv > 0 ? known.reduce((a, x) => a + x.value * x.r!.change, 0) / kv : null;
    const sorted = [...known].sort((a, b) => a.r!.change - b.r!.change);
    return {
      e,
      portfolio,
      coverage: kv / total,
      worst: sorted[0] ? { symbol: sorted[0].symbol, change: sorted[0].r!.change } : null,
      best: sorted.length ? { symbol: sorted[sorted.length - 1].symbol, change: sorted[sorted.length - 1].r!.change } : null,
      rows: rows.map(({ symbol, r }) => ({ symbol, r })),
    };
  });
  return { beta: pb, coverage: cov, betas, episodes };
}
