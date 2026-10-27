/**
 * Is a stock cheap against its own history? Its P/E on each past week (the
 * market value then ÷ the yearly profit known at the time) against today's.
 * Market value is the split- and bonus-adjusted price × today's share count,
 * so splits don't distort it (PSX's per-share EPS isn't restated after a
 * split). A year's profit counts from about three months after the year
 * ends, when companies publish it.
 */
import type { Candle } from '../psx/types';

export interface PeBand {
  points: { t: number; pe: number }[];
  now: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** share of past weeks with a higher P/E than today (0–1): 0.8 means cheaper than 80% of the time */
  cheaperThan: number;
  from: number;
  years: number;
}

const quantile = (s: number[], q: number) => {
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
};

/** `profits`: yearly profit after tax in rupees, by fiscal year label ("2026" = the year ending in 2026). */
export function peBand(x: { candles: Candle[]; profits: { fy: string; profit: number }[]; fyEndMonth: number; shares: number; lagMonths?: number }): PeBand | null {
  const lag = x.lagMonths ?? 3;
  const years = x.profits
    .filter((p) => p.profit > 0 && /^\d{4}$/.test(p.fy))
    .map((p) => {
      const y = Number(p.fy);
      // known from the end of the fiscal year plus the reporting lag
      const known = Date.UTC(y, x.fyEndMonth + 1 + lag, 1);
      return { known, profit: p.profit };
    })
    .sort((a, b) => a.known - b.known);
  if (!years.length || !(x.shares > 0)) return null;
  const c = x.candles.filter((b) => b.c > 0).sort((a, b) => a.t - b.t);
  const pts: { t: number; pe: number }[] = [];
  let last = 0;
  for (const b of c) {
    if (b.t - last < 6 * 864e5) continue;
    const y = [...years].reverse().find((v) => v.known <= b.t);
    if (!y) continue;
    last = b.t;
    pts.push({ t: b.t, pe: (b.c * x.shares) / y.profit });
  }
  if (pts.length < 26) return null;
  const lastBar = c[c.length - 1];
  const latest = years[years.length - 1];
  const now = (lastBar.c * x.shares) / latest.profit;
  const s = pts.map((p) => p.pe).sort((a, b) => a - b);
  return {
    points: pts,
    now,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1],
    cheaperThan: s.filter((v) => v > now).length / s.length,
    from: pts[0].t,
    years: (lastBar.t - pts[0].t) / (365.25 * 864e5),
  };
}

/** Yearly profits from PSX's annual table (values in Rs thousands). */
export function profitsFrom(table: { periods: string[]; rows: { label: string; values: (number | null)[] }[] } | null | undefined): { fy: string; profit: number }[] {
  const row = table?.rows.find((r) => /profit after/i.test(r.label));
  if (!table || !row) return [];
  return table.periods.map((fy, i) => ({ fy, profit: (row.values[i] ?? 0) * 1000 })).filter((p) => p.profit > 0);
}
