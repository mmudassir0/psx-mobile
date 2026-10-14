/**
 * Turns indicators into one technical score per stock.
 *
 * Each rule votes +1 (bullish), -1 (bearish) or 0 with a weight and a plain
 * reason. Score = 5 + 5 × (weighted votes / total weight), so 0..10 with 5 as
 * neutral. Everything here is deterministic: the AI layer explains these
 * numbers later, it never computes them.
 */
import type { Candle } from '../psx/types';
import { atr, bollinger, closes, ema, last, macd, obv, rsi, sma, volumes } from './indicators';
import { findLevels, Level } from './levels';

export type Vote = 1 | 0 | -1;

export interface Rule {
  id: string;
  name: string;
  vote: Vote;
  weight: number;
  reason: string;
}

export type Stance = 'Strong bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong bearish';

export interface Indicators {
  close: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  atr14: number | null;
  volRatio: number | null;
}

export interface Analysis {
  /** epoch ms of the last daily bar used */
  asOf: number;
  score: number;
  stance: Stance;
  rules: Rule[];
  ind: Indicators;
  support: Level | null;
  resistance: Level | null;
  /** close − 2 × ATR, a volatility-based stop for a long position */
  stop: number | null;
  /** bars of history used; under 200 means the long-trend rules were skipped */
  bars: number;
}

export const MIN_BARS = 60;

export function stanceFor(score: number): Stance {
  if (score >= 7.5) return 'Strong bullish';
  if (score >= 6) return 'Bullish';
  if (score > 4) return 'Neutral';
  if (score > 2.5) return 'Bearish';
  return 'Strong bearish';
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const f1 = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

/** Analyse daily candles (oldest first). Returns null when there is too little history. */
export function analyze(candles: Candle[]): Analysis | null {
  const c = candles.filter((b) => b.c > 0);
  if (c.length < MIN_BARS) return null;
  const cl = closes(c);
  const n = c.length - 1;
  const close = cl[n];

  const e20 = ema(cl, 20);
  const e50 = ema(cl, 50);
  const e200 = ema(cl, 200);
  const r = rsi(cl, 14);
  const m = macd(cl);
  const bb = bollinger(cl, 20, 2);
  const a = atr(c, 14);
  const vAvg = sma(volumes(c), 20);
  const ob = obv(c);
  const obAvg = sma(ob, 20);

  const ind: Indicators = {
    close,
    ema20: last(e20),
    ema50: last(e50),
    ema200: last(e200),
    rsi14: last(r),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    bbUpper: last(bb.upper),
    bbLower: last(bb.lower),
    atr14: last(a),
    volRatio: last(vAvg) ? c[n].v / (last(vAvg) as number) : null,
  };

  const rules: Rule[] = [];
  const add = (id: string, name: string, weight: number, vote: Vote, reason: string) => rules.push({ id, name, weight, vote, reason });

  // 1. Long-term trend
  if (ind.ema200 != null) {
    const d = pct(close, ind.ema200);
    add('trend200', 'Long-term trend', 2, d > 0 ? 1 : -1, `Price is ${f1(Math.abs(d))}% ${d > 0 ? 'above' : 'below'} the 200-day average`);
  }
  // 2. Golden / death cross state, and a fresh cross in the last 10 days
  if (ind.ema50 != null && ind.ema200 != null) {
    const up = ind.ema50 > ind.ema200;
    let fresh = false;
    for (let i = n - 9; i <= n && i > 0; i++) {
      const p50 = e50[i - 1], p200 = e200[i - 1], c50 = e50[i], c200 = e200[i];
      if (p50 != null && p200 != null && c50 != null && c200 != null && p50 > p200 !== c50 > c200) fresh = true;
    }
    add(
      'cross',
      '50/200-day averages',
      1.5,
      up ? 1 : -1,
      fresh
        ? `${up ? 'Golden' : 'Death'} cross in the last 10 days: 50-day average just moved ${up ? 'above' : 'below'} the 200-day`
        : `50-day average is ${up ? 'above' : 'below'} the 200-day`,
    );
  }
  // 3. Short-term trend
  if (ind.ema20 != null) {
    const d = pct(close, ind.ema20);
    add('trend20', 'Short-term trend', 1, d > 0 ? 1 : -1, `Price is ${f1(Math.abs(d))}% ${d > 0 ? 'above' : 'below'} the 20-day average`);
  }
  // 4. MACD
  if (ind.macd != null && ind.macdSignal != null) {
    const up = ind.macd > ind.macdSignal;
    let crossAgo = -1;
    for (let i = n; i > n - 5 && i > 0; i--) {
      const h0 = m.hist[i], h1 = m.hist[i - 1];
      if (h0 != null && h1 != null && h0 > 0 !== h1 > 0) {
        crossAgo = n - i;
        break;
      }
    }
    const when = crossAgo === 0 ? 'today' : crossAgo === 1 ? 'yesterday' : `${crossAgo} days ago`;
    add(
      'macd',
      'MACD momentum',
      1,
      up ? 1 : -1,
      crossAgo >= 0 ? `MACD crossed ${up ? 'above' : 'below'} its signal line ${when}` : `MACD is ${up ? 'above' : 'below'} its signal line`,
    );
  }
  // 5. RSI
  if (ind.rsi14 != null) {
    const v = ind.rsi14;
    if (v < 30) add('rsi', 'RSI', 1, 1, `RSI ${v.toFixed(0)}: oversold, a rebound is common from here`);
    else if (v > 70) add('rsi', 'RSI', 1, -1, `RSI ${v.toFixed(0)}: overbought, pullbacks are common from here`);
    else if (v >= 50) add('rsi', 'RSI', 0.5, 1, `RSI ${v.toFixed(0)}: buyers in control`);
    else add('rsi', 'RSI', 0.5, -1, `RSI ${v.toFixed(0)}: sellers in control`);
  }
  // 6. Bollinger bands
  if (ind.bbUpper != null && ind.bbLower != null) {
    if (close < ind.bbLower) add('bb', 'Bollinger bands', 0.5, 1, 'Closed below the lower band: stretched to the downside');
    else if (close > ind.bbUpper) add('bb', 'Bollinger bands', 0.5, -1, 'Closed above the upper band: stretched to the upside');
    else add('bb', 'Bollinger bands', 0.5, 0, 'Inside the bands');
  }
  // 7. Volume confirmation of today's move
  if (ind.volRatio != null && n > 0) {
    const dir = cl[n] > cl[n - 1] ? 1 : cl[n] < cl[n - 1] ? -1 : 0;
    const x = ind.volRatio;
    if (x >= 1.5 && dir !== 0)
      add('volume', 'Volume', 0.5, dir as Vote, `${dir > 0 ? 'Up' : 'Down'} day on ${x.toFixed(1)}× the 20-day average volume`);
    else add('volume', 'Volume', 0.5, 0, `Volume ${x.toFixed(1)}× the 20-day average`);
  }
  // 8. On-balance volume: is money flowing in or out?
  const obA = last(obAvg);
  if (obA != null) {
    const up = ob[n] > obA;
    add('obv', 'Money flow (OBV)', 0.5, up ? 1 : -1, up ? 'On-balance volume rising: accumulation' : 'On-balance volume falling: distribution');
  }

  const total = rules.reduce((s, x) => s + x.weight, 0);
  const net = rules.reduce((s, x) => s + x.weight * x.vote, 0);
  const score = total ? Math.round((5 + (5 * net) / total) * 10) / 10 : 5;
  const lv = findLevels(c, close);

  return {
    asOf: c[n].t,
    score,
    stance: stanceFor(score),
    rules,
    ind,
    support: lv.support,
    resistance: lv.resistance,
    stop: ind.atr14 != null ? close - 2 * ind.atr14 : null,
    bars: c.length,
  };
}
