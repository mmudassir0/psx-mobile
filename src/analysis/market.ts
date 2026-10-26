/**
 * Market analysis from index closes: trend (up, down, sideways), how long it
 * has lasted, the range and key levels, and returns over common periods.
 * Indices have closes only (no daily high/low), so everything uses closes.
 */
import type { Candle, SeriesPoint } from '../psx/types';
import { ema } from './indicators';
import { findLevels } from './levels';

/**
 * What stocks are compared with. KSE-100 itself is a total-return index (it
 * adds back dividends) while Sahm's stock prices don't, so comparisons use
 * PSX's price-only KSE-100 (KSE100PR); otherwise every stock looks about 6% a
 * year worse than it did.
 */
export const BENCHMARK = 'KSE100PR';

export type Regime = 'Uptrend' | 'Downtrend' | 'Sideways';

export interface IndexTrend {
  regime: Regime;
  /** epoch ms of the first day of the current trend */
  since: number;
  /** trading days the current trend has lasted */
  days: number;
  close: number;
  asOf: number;
  ma50: number;
  ma200: number;
  /** change in the 200-day average over the last 20 days */
  slope200: number;
  /** 60-session range */
  rangeHigh: number;
  rangeLow: number;
  support: number | null;
  resistance: number | null;
  high52: number;
  low52: number;
  /** close vs the 52-week high, e.g. -0.12 */
  fromHigh: number;
  returns: { w1: number | null; m1: number | null; m3: number | null; y1: number | null; ytd: number | null };
}

/** The 200-day average must move this much over 20 days to count as rising or falling. */
const SLOPE = 0.01;
/** A new reading has to hold this many days before the trend changes. */
const CONFIRM = 5;

export function rawRegime(close: number, ma50: number, ma200: number, slope200: number): Regime {
  if (close > ma50 && ma50 > ma200 && slope200 > SLOPE) return 'Uptrend';
  if (close < ma50 && ma50 < ma200 && slope200 < -SLOPE) return 'Downtrend';
  return 'Sideways';
}

/** Trend for each day, changing only after CONFIRM days of a new reading. */
export function regimes(cl: number[]): (Regime | null)[] {
  const m50 = ema(cl, 50);
  const m200 = ema(cl, 200);
  const out: (Regime | null)[] = cl.map(() => null);
  let cur: Regime | null = null;
  let pending: Regime | null = null;
  let count = 0;
  for (let i = 0; i < cl.length; i++) {
    const a = m50[i], b = m200[i], b20 = i >= 20 ? m200[i - 20] : null;
    if (a == null || b == null || b20 == null) continue;
    const raw = rawRegime(cl[i], a, b, b / b20 - 1);
    if (cur == null) cur = raw;
    else if (raw !== cur) {
      if (raw === pending) count++;
      else {
        pending = raw;
        count = 1;
      }
      if (count >= CONFIRM) {
        cur = raw;
        pending = null;
        count = 0;
      }
    } else {
      pending = null;
      count = 0;
    }
    out[i] = cur;
  }
  return out;
}

const PKT = 5 * 3600_000;
function retOver(pts: SeriesPoint[], days: number): number | null {
  const n = pts.length - 1;
  return n - days >= 0 ? pts[n].v / pts[n - days].v - 1 : null;
}

export function indexTrend(points: SeriesPoint[]): IndexTrend | null {
  const pts = points.filter((p) => p.v > 0);
  if (pts.length < 230) return null;
  const cl = pts.map((p) => p.v);
  const n = cl.length - 1;
  const m50 = ema(cl, 50);
  const m200 = ema(cl, 200);
  const reg = regimes(cl);
  const regime = reg[n];
  if (!regime || m50[n] == null || m200[n] == null || m200[n - 20] == null) return null;
  let start = n;
  while (start > 0 && reg[start - 1] === regime) start--;
  // The trend "began" when its reading first appeared, not when it was confirmed.
  const confirmBack = Math.max(0, start - (CONFIRM - 1));
  const sinceIdx = start === 0 ? 0 : confirmBack;
  const last60 = cl.slice(-60);
  const last250 = cl.slice(-250);
  const candles: Candle[] = pts.map((p) => ({ t: p.t, o: p.v, h: p.v, l: p.v, c: p.v, v: p.vol }));
  const lv = findLevels(candles, cl[n]);
  const year = new Date(pts[n].t + PKT).getUTCFullYear();
  const firstOfYear = pts.findIndex((p) => new Date(p.t + PKT).getUTCFullYear() === year);
  const baseYtd = firstOfYear > 0 ? cl[firstOfYear - 1] : null;
  const high52 = Math.max(...last250);
  return {
    regime,
    since: pts[sinceIdx].t,
    days: n - sinceIdx + 1,
    close: cl[n],
    asOf: pts[n].t,
    ma50: m50[n] as number,
    ma200: m200[n] as number,
    slope200: (m200[n] as number) / (m200[n - 20] as number) - 1,
    rangeHigh: Math.max(...last60),
    rangeLow: Math.min(...last60),
    support: lv.support?.price ?? null,
    resistance: lv.resistance?.price ?? null,
    high52,
    low52: Math.min(...last250),
    fromHigh: cl[n] / high52 - 1,
    returns: { w1: retOver(pts, 5), m1: retOver(pts, 21), m3: retOver(pts, 63), y1: retOver(pts, 250), ytd: baseYtd ? cl[n] / baseYtd - 1 : null },
  };
}

/** What would change the picture, in words. */
export function trendTriggers(t: IndexTrend): { up: string; down: string } {
  const f = (v: number) => Math.round(v).toLocaleString('en-US');
  if (t.regime === 'Downtrend')
    return {
      up: `A move back above the 50-day average (${f(t.ma50)})${t.resistance ? ` and resistance at ${f(t.resistance)}` : ''} would be the first sign the downtrend is ending.`,
      down: t.support ? `Support is at ${f(t.support)}; a close below it would extend the fall.` : `The 60-day low is ${f(t.rangeLow)}.`,
    };
  if (t.regime === 'Uptrend')
    return {
      up: t.resistance ? `Resistance at ${f(t.resistance)}; a close above it continues the uptrend.` : `It is near its 52-week high of ${f(t.high52)}.`,
      down: `A close below the 50-day average (${f(t.ma50)}) would be the first warning; below the 200-day (${f(t.ma200)}) the uptrend is in doubt.`,
    };
  return {
    up: `A close above the range top of ${f(t.rangeHigh)} would point to an uptrend.`,
    down: `A close below the range bottom of ${f(t.rangeLow)} would point to a downtrend.`,
  };
}

export interface SectorStat {
  name: string;
  /** liquid stocks counted */
  n: number;
  /** average 1-week and 1-month return of its stocks */
  r1w: number;
  r1m: number;
  /** average 5-day volume against the 60-day average */
  vol: number;
  /** share of its stocks above their 200-day average */
  up: number;
  /** average 3- and 6-month return (feeds from late October 2026 on) */
  r3m?: number | null;
  r6m?: number | null;
}

export interface MarketFeed {
  v: 1;
  kind: 'market';
  day: string;
  generatedAt: string;
  breadth: number | null;
  indices: Record<string, { regime: Regime; since: number; days: number; close: number; r1m: number | null; fromHigh: number }>;
  stale?: boolean;
  /** compact rows: [name, n, r1w, r1m, vol, up, r3m?, r6m?] */
  sectors: [string, number, number, number, number, number, number?, number?][];
  /** market mood, 0 extreme fear … 100 extreme greed (see mood.ts) */
  mood?: { score: number; parts: (number | null)[]; day: string };
}

export const sectorRows = (f: MarketFeed): SectorStat[] => f.sectors.map(([name, n, r1w, r1m, vol, up, r3m, r6m]) => ({ name, n, r1w, r1m, vol, up, r3m: r3m ?? null, r6m: r6m ?? null }));

const pkDate = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/**
 * The stock's change over its last `bars` sessions against the index's change
 * between the same two dates (the index's last close on or before each date).
 */
export function relativeReturn(candles: Candle[], index: SeriesPoint[], bars: number): { stockRet: number; indexRet: number; alpha: number } | null {
  const n = candles.length - 1;
  if (n < bars || !index.length) return null;
  const from = candles[n - bars];
  const to = candles[n];
  if (!(from.c > 0)) return null;
  const at = (day: string) => {
    let v: number | null = null;
    for (const p of index) {
      if (pkDate(p.t) <= day) v = p.v;
      else break;
    }
    return v;
  };
  const i0 = at(pkDate(from.t));
  const i1 = at(pkDate(to.t));
  if (i0 == null || i1 == null || !(i0 > 0)) return null;
  const stockRet = to.c / from.c - 1;
  const indexRet = i1 / i0 - 1;
  return { stockRet, indexRet, alpha: stockRet - indexRet };
}
