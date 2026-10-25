/**
 * The long-term buy list: actively traded companies whose profit grew last
 * year, that are cheaper than their sector on P/E, and whose price is above
 * its 200-day average. Cheapest first, top 10, formed once a month and meant
 * to be held 6–12 months.
 *
 * Chosen by scripts/longterm-study.ts (docs/backtest.md): from late 2023 these
 * lists beat the average liquid PSX stock over the next six months in about
 * 60–80% of months, in both 2023–24 and 2025–26, while price-only rules
 * (momentum, low volatility, 52-week highs) did not hold up from 2017.
 * Only three years of results exist, mostly a rising market.
 */
import type { Candle, FinTable } from '../psx/types';

export const LT = { top: 10, minLiquidity: 5_000_000, maxPe: 60, perSector: 99 };

export interface LtInput {
  symbol: string;
  sector: string | null;
  candles: Candle[];
  annual: FinTable | null;
}

export interface LtRow {
  symbol: string;
  sector: string;
  price: number;
  /** price ÷ latest annual EPS */
  pe: number;
  /** median P/E of the sector's liquid, profitable stocks */
  sectorPe: number;
  /** latest annual EPS against the year before */
  growth: number;
  /** price against the 200-day average, e.g. 0.08 = 8% above */
  above200: number;
  /** fiscal year of the profit used */
  fy: string;
}

/** Latest two annual EPS figures, newest first, from a PSX results table. */
export function epsYears(t: FinTable | null): { fy: string; eps: number }[] {
  if (!t?.periods?.length) return [];
  const row = t.rows.find((r) => /^eps/i.test(r.label));
  if (!row) return [];
  return t.periods
    .map((p, i) => ({ fy: p, y: Number(p.match(/\d{4}/)?.[0]), eps: row.values[i] }))
    .filter((x): x is { fy: string; y: number; eps: number } => !!x.y && typeof x.eps === 'number' && Number.isFinite(x.eps))
    .sort((a, b) => b.y - a.y)
    .map(({ fy, eps }) => ({ fy, eps }));
}

const liquidity = (c: Candle[]) => {
  const v = c.slice(-60).map((b) => b.c * b.v).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
};

export interface LtResult {
  /** passes every rule, cheapest first, at most LT.top */
  list: LtRow[];
  /** liquid, profitable stocks with a P/E (the field the sectors are compared in) */
  valued: number;
  /** how many failed only on the 200-day average: candidates once the market turns */
  belowTrend: number;
}

export function longTermList(items: LtInput[]): LtResult {
  const valued: (LtRow & { pass: boolean })[] = [];
  for (const x of items) {
    const c = x.candles;
    if (c.length < 200 || !x.sector || liquidity(c) < LT.minLiquidity) continue;
    const [last, prev] = epsYears(x.annual);
    if (!last || !(last.eps > 0)) continue;
    const price = c[c.length - 1].c;
    const pe = price / last.eps;
    if (!(pe > 0) || pe > LT.maxPe) continue;
    let s = 0;
    for (let k = c.length - 200; k < c.length; k++) s += c[k].c;
    const growth = prev && prev.eps > 0 ? last.eps / prev.eps - 1 : -1;
    valued.push({ symbol: x.symbol, sector: x.sector.toUpperCase(), price, pe, sectorPe: 0, growth, above200: price / (s / 200) - 1, fy: last.fy, pass: false });
  }
  const med = new Map<string, number>();
  for (const sec of new Set(valued.map((v) => v.sector))) {
    const p = valued.filter((v) => v.sector === sec).map((v) => v.pe).sort((a, b) => a - b);
    med.set(sec, p[p.length >> 1]);
  }
  let belowTrend = 0;
  for (const v of valued) {
    v.sectorPe = med.get(v.sector)!;
    const cheapGrowing = v.growth > 0 && v.pe < v.sectorPe;
    v.pass = cheapGrowing && v.above200 > 0;
    if (cheapGrowing && v.above200 <= 0) belowTrend++;
  }
  const count = new Map<string, number>();
  const list = valued
    .filter((v) => v.pass)
    .sort((a, b) => a.pe - b.pe)
    .filter((v) => {
      const n = count.get(v.sector) ?? 0;
      if (n >= LT.perSector) return false;
      count.set(v.sector, n + 1);
      return true;
    })
    .slice(0, LT.top)
    .map(({ pass: _p, ...r }) => r);
  return { list, valued: valued.length, belowTrend };
}

// ---------------------------------------------------------------- feed ----

/** One month's list as formed, with the prices that day. */
export interface LtMonth {
  month: string;
  day: string;
  /** [symbol, price] */
  picks: [string, number][];
  /** every liquid stock that day, to compare with: [symbol, price] */
  base: [string, number][];
  /** the list's figures that day */
  rows?: LtRow[];
}

export interface LtFeed {
  v: 1;
  kind: 'longterm';
  day: string;
  generatedAt: string;
  /** this month's list, as formed on its first trading day */
  month: string;
  formed: string;
  /** this month's stocks and their price on the day the list was formed */
  picks: [string, number][];
  /** their figures that day (or today's, where the job no longer has that day's) */
  list: LtRow[];
  /** how today's prices and results judge the same stocks (they may have dropped out since) */
  today: LtResult;
  /** each earlier month: the list's average change since, against the average liquid stock */
  record: { month: string; day: string; n: number; ret: number; base: number }[];
}

export const isLtFeed = (x: unknown): x is LtFeed => {
  const f = x as LtFeed | null;
  return !!f && f.v === 1 && f.kind === 'longterm' && Array.isArray(f.list) && Array.isArray(f.record) && !!f.today;
};

/** Average change from the formation prices to now; stocks with no price now are left out. */
export function monthReturn(m: LtMonth, priceNow: (s: string) => number | null): { n: number; ret: number; base: number } | null {
  const avg = (rows: [string, number][]) => {
    const r = rows.map(([s, p]) => {
      const q = priceNow(s);
      return q != null && p > 0 ? q / p - 1 : null;
    }).filter((v): v is number => v != null);
    return r.length ? { n: r.length, v: r.reduce((a, b) => a + b, 0) / r.length } : null;
  };
  const a = avg(m.picks);
  const b = avg(m.base);
  return a && b ? { n: a.n, ret: a.v, base: b.v } : null;
}
