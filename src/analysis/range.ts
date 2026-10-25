/**
 * Expected price range: where a price is likely to be after 1, 5 or 21
 * trading days, at an 80% chance. Not a direction.
 *
 * Swings come in streaks, so recent volatility is weighted most (an
 * exponentially weighted average of squared daily moves, RiskMetrics-style).
 * Further ahead, calm and wild spells tend to fade, so the recent figure is
 * blended with the last year's (30% at a week, 60% at a month). The width
 * multipliers were measured on PSX data (scripts/range-study.ts): chosen on
 * 2017–21 liquid stocks, then checked on 2022–26, where the 80% ranges held
 * the actual price 82–84% of the time. The index trends more than single
 * stocks, so its multi-day ranges are wider (measured on 2021–26 only).
 */
export const RANGE = {
  lambda: 0.94,
  /** share of the last year's volatility in the blend, per horizon */
  blend: { 1: 0, 5: 0.3, 21: 0.6 } as Record<number, number>,
  z80: {
    stock: { 1: 1.27, 5: 1.28, 21: 1.34 } as Record<number, number>,
    index: { 1: 1.16, 5: 1.39, 21: 1.53 } as Record<number, number>,
  },
  minBars: 60,
};

const logReturns = (closes: number[]) => {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i] > 0 && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  return r;
};

/** Daily volatility (standard deviation of log returns) as of the last close. */
export function ewmaVol(closes: number[], lambda = RANGE.lambda): number | null {
  if (closes.length < RANGE.minBars) return null;
  const r = logReturns(closes);
  if (r.length < RANGE.minBars - 1) return null;
  const seed = r.slice(0, 30);
  let v = seed.reduce((a, b) => a + b * b, 0) / seed.length;
  for (let i = 30; i < r.length; i++) v = lambda * v + (1 - lambda) * r[i] * r[i];
  return Math.sqrt(v);
}

/** Volatility used for a horizon: recent, blended with the last year's further ahead. */
export function horizonVol(closes: number[], days: number): number | null {
  const v = ewmaVol(closes);
  if (v == null) return null;
  const w = RANGE.blend[days] ?? 0.6;
  if (!w || closes.length < 252) return v;
  const r = logReturns(closes.slice(-251));
  const year = r.reduce((a, b) => a + b * b, 0) / r.length;
  return Math.sqrt((1 - w) * v * v + w * year);
}

export interface PriceRange {
  days: number;
  low: number;
  high: number;
  /** half-width as a share of the price, e.g. 0.031 = about ±3.1% */
  pct: number;
}

/** Likely range after `days` sessions; PSX's ±10% daily limit caps a 1-day range. */
export function priceRange(closes: number[], days: number, kind: 'stock' | 'index' = 'stock'): PriceRange | null {
  const vol = horizonVol(closes, days);
  const p = closes[closes.length - 1];
  if (vol == null || !(p > 0)) return null;
  let w = (RANGE.z80[kind][days] ?? 1.3) * vol * Math.sqrt(days);
  if (days === 1) w = Math.min(w, Math.log(1.1));
  return { days, low: p * Math.exp(-w), high: p * Math.exp(w), pct: Math.exp(w) - 1 };
}
