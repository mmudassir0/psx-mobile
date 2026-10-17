/**
 * Daily trade picks: which liquid stocks show a setup today, the buy zone,
 * stop and targets for each, and how a pick played out afterwards.
 *
 * The same functions run the backtest (scripts/picks-study.ts), the daily job
 * (scripts/daily-picks.ts) and the scorecard, so what was tested is exactly
 * what is sent.
 */
import type { Candle } from '../psx/types';
import { rulesAt, SeriesSet } from './signals';

export type SetupId = 'pullback' | 'breakout' | 'momentum';
export const SETUP_NAMES: Record<SetupId, string> = {
  pullback: 'Pullback in an uptrend',
  breakout: 'Breakout on volume',
  momentum: 'Strong momentum',
};

/** Below this median daily traded value (Rs, 60 sessions) no picks: the backtest found chart signals don't work there. */
export const MIN_LIQUIDITY = 5_000_000;

export function liquidityAt(S: SeriesSet, i: number): number {
  const v = S.c.slice(Math.max(0, i - 59), i + 1).map((b) => b.v * b.c).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
}

/** Setups present on day i (using data up to day i only), with a strength for ranking. */
export function setupsAt(S: SeriesSet, i: number): { id: SetupId; strength: number }[] {
  const { c, cl, e20, e50, e200, rsi, hist, volAvg } = S;
  const close = cl[i];
  const out: { id: SetupId; strength: number }[] = [];
  const E20 = e20[i], E50 = e50[i], E200 = e200[i], R = rsi[i];
  if (E20 == null || E50 == null || E200 == null || R == null || i < 21) return out;

  // Pullback: uptrend (price > 50 > 200), dipped to the 20-day average in the last 2 days, held above it.
  const dipped = Math.min(c[i].l, c[i - 1].l) <= E20 * 1.01;
  if (close > E50 && E50 > E200 && dipped && close > E20 && R >= 40 && R <= 65) {
    out.push({ id: 'pullback', strength: (close / E200 - 1) * 10 + (hist[i] != null && hist[i - 1] != null && hist[i]! > hist[i - 1]! ? 1 : 0) });
  }
  // Breakout: closes at a 20-day high on 1.5× volume, above the 50-day average.
  const prevHigh = Math.max(...c.slice(i - 20, i).map((b) => b.h));
  const va = volAvg[i];
  if (close > prevHigh && va && c[i].v >= 1.5 * va && close > E50) {
    out.push({ id: 'breakout', strength: c[i].v / va });
  }
  // Momentum: Sahm's technical score in "strong bullish".
  const score = rulesAt(S, i).score;
  if (score >= 7.5) out.push({ id: 'momentum', strength: score });
  return out;
}

export interface Levels {
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  tp2: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Buy zone half an ATR below the close, stop one ATR under the zone, targets at 1R and 2R from the middle of the zone. */
export function levelsAt(S: SeriesSet, i: number, k = { zone: 0.5, stop: 1, tp1: 1, tp2: 2 }): Levels | null {
  const atr = S.atr[i];
  if (atr == null || atr <= 0) return null;
  const close = S.cl[i];
  const entryHigh = close;
  const entryLow = close - k.zone * atr;
  const stop = entryLow - k.stop * atr;
  const mid = (entryLow + entryHigh) / 2;
  const risk = mid - stop;
  return { entryLow: r2(entryLow), entryHigh: r2(entryHigh), stop: r2(stop), tp1: r2(mid + k.tp1 * risk), tp2: r2(mid + k.tp2 * risk) };
}

export type Result = 'no-fill' | 'stop' | 'tp1-then-even' | 'tp1-then-time' | 'tp2' | 'time' | 'open';

export interface Outcome {
  result: Result;
  /** return on the money put in, after costs; null if never bought */
  ret: number | null;
  /** in units of the planned risk */
  r: number | null;
  filledAt: number | null;
  closedAt: number | null;
  hitTp1: boolean;
}

/** Round-trip cost (commission, taxes, spread). */
export const PICK_COST = 0.003;
export const WAIT_DAYS = 3;
export const HOLD_DAYS = 10;

/**
 * Plays a pick forward through daily bars after the signal day.
 * Bought when a day trades into the zone (at the open if it opens inside or
 * below it). Half is sold at TP1 and the stop moves to the entry; the rest at
 * TP2, the stop, or the close after HOLD_DAYS. When a day touches both the
 * stop and a target, the stop is assumed first. A day opening at or below the
 * stop before the buy means no trade. Cash dividends earned while holding are
 * added to the return (the shares fall by about the dividend on the ex-date).
 */
/** A cash dividend: the first day the shares trade without it (ex-date) and Rs per share. */
export interface CashDividend {
  exT: number;
  dps: number;
}

export function playOut(after: Candle[], L: Levels, wait = WAIT_DAYS, hold = HOLD_DAYS, cash: CashDividend[] = []): Outcome {
  let entry: number | null = null;
  let filledIdx = -1;
  for (let d = 0; d < Math.min(wait, after.length); d++) {
    const b = after[d];
    // A day that opens at or below the stop gives no trade: the plan was already broken.
    if (b.o > 0 && b.o <= L.stop) return { result: 'no-fill', ret: null, r: null, filledAt: null, closedAt: null, hitTp1: false };
    if (b.l <= L.entryHigh) {
      entry = b.o > 0 ? Math.min(b.o, L.entryHigh) : L.entryHigh;
      filledIdx = d;
      break;
    }
  }
  if (entry == null) return { result: after.length >= wait ? 'no-fill' : 'open', ret: null, r: null, filledAt: null, closedAt: null, hitTp1: false };
  const risk = entry - L.stop;
  let stop = L.stop;
  let half = 0; // proceeds per share from the half sold at TP1
  let hitTp1 = false;
  // Dividends earned while holding: shares bought before the ex-date and still held on it.
  let divs = 0;
  const done = (res: Result, exit: number, d: number): Outcome => {
    const gross = (hitTp1 ? (half + exit / 2) / entry! - 1 : exit / entry! - 1) + divs / entry!;
    const ret = gross - PICK_COST;
    return { result: res, ret, r: risk > 0 ? (ret * entry!) / risk : null, filledAt: after[filledIdx].t, closedAt: after[d].t, hitTp1 };
  };
  for (let d = filledIdx; d < after.length && d <= filledIdx + hold; d++) {
    const b = after[d];
    if (d > filledIdx) for (const x of cash) if (x.exT > after[d - 1].t && x.exT <= b.t) divs += x.dps * (hitTp1 ? 0.5 : 1);
    const open = d === filledIdx ? entry : b.o > 0 ? b.o : b.c;
    if (b.l <= stop) return done(hitTp1 ? 'tp1-then-even' : 'stop', Math.min(open, stop), d);
    if (!hitTp1 && b.h >= L.tp1) {
      hitTp1 = true;
      half = Math.max(open, L.tp1) / 2;
      stop = entry;
    }
    if (hitTp1 && b.h >= L.tp2) return done('tp2', Math.max(open, L.tp2), d);
    if (d === filledIdx + hold) return done(hitTp1 ? 'tp1-then-time' : 'time', b.c, d);
  }
  return { result: 'open', ret: null, r: null, filledAt: after[filledIdx].t, closedAt: null, hitTp1 };
}
