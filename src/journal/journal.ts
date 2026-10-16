/**
 * Sahm's own track record. Every stock verdict and holding decision you are
 * shown is saved here (one per stock per day), with the price that day. Later
 * it is scored against what the price actually did, compared with KSE-100
 * over the same days. Kept on the phone only.
 */
import type { Candle, SeriesPoint } from '../psx/types';

export type Kind = 'verdict' | 'holding';
export interface Entry {
  symbol: string;
  /** YYYY-MM-DD (Pakistan) */
  day: string;
  kind: Kind;
  /** Bullish / Neutral / Bearish for verdicts; Add more / Hold / Trim / Review for holdings */
  call: string;
  confidence?: string;
  price: number;
}

export const HORIZONS = [21, 63] as const; // about 1 and 3 months of trading days
export type H = (typeof HORIZONS)[number];

/** What each call claims, so it can be checked: up = should beat the market, down = should lag it. */
export function claim(e: Entry): 'up' | 'down' | null {
  if (e.call === 'Bullish' || e.call === 'Add more') return 'up';
  if (e.call === 'Bearish' || e.call === 'Review' || e.call === 'Trim') return 'down';
  return null;
}

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** Adds an entry unless one exists for the same stock, kind and day; keeps the newest `max`. */
export function addEntry(list: Entry[], e: Entry, max = 3000): Entry[] {
  if (list.some((x) => x.symbol === e.symbol && x.kind === e.kind && x.day === e.day)) return list;
  return [...list, e].slice(-max);
}

export interface Scored {
  e: Entry;
  /** stock change over the horizon from the entry day's close, or null if not that far yet */
  ret: Partial<Record<H, number>>;
  /** stock change minus KSE-100's change over the same days */
  rel: Partial<Record<H, number>>;
}

function closeIndex<T extends { t: number }>(rows: T[], day: string): number {
  // last row on or before the day
  let r = -1;
  for (let i = 0; i < rows.length; i++) {
    if (pkDay(rows[i].t) <= day) r = i;
    else break;
  }
  return r;
}

export function scoreEntry(e: Entry, candles: Candle[], index: SeriesPoint[] | null): Scored {
  const out: Scored = { e, ret: {}, rel: {} };
  const i = closeIndex(candles, e.day);
  if (i < 0) return out;
  const base = candles[i].c;
  const j = index ? closeIndex(index, e.day) : -1;
  for (const h of HORIZONS) {
    if (i + h >= candles.length) continue;
    const r = candles[i + h].c / base - 1;
    out.ret[h] = r;
    if (index && j >= 0) {
      // index on the same date as the stock's horizon close
      const k = closeIndex(index, pkDay(candles[i + h].t));
      if (k > j) out.rel[h] = r - (index[k].v / index[j].v - 1);
    }
  }
  return out;
}

export interface CallStats {
  call: string;
  /** entries old enough to score at this horizon */
  n: number;
  /** share where the claim held against the market (up: beat KSE-100; down: lagged it) */
  right: number | null;
  avgRet: number | null;
  avgRel: number | null;
}

export function statsByCall(scored: Scored[], h: H): CallStats[] {
  const calls = [...new Set(scored.map((s) => s.e.call))];
  return calls
    .map((call) => {
      const xs = scored.filter((s) => s.e.call === call && s.ret[h] != null);
      const withRel = xs.filter((s) => s.rel[h] != null);
      const dir = claim(xs[0]?.e ?? ({ call } as Entry));
      const right = dir && withRel.length ? withRel.filter((s) => (dir === 'up' ? s.rel[h]! > 0 : s.rel[h]! < 0)).length / withRel.length : null;
      const avg = (a: number[]) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
      return { call, n: xs.length, right, avgRet: avg(xs.map((s) => s.ret[h]!)), avgRel: avg(withRel.map((s) => s.rel[h]!)) };
    })
    .sort((a, b) => ORDER.indexOf(a.call) - ORDER.indexOf(b.call));
}
const ORDER = ['Bullish', 'Neutral', 'Bearish', 'Add more', 'Hold', 'Trim', 'Review'];
