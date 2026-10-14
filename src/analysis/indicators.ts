/**
 * Technical indicators over daily candles.
 *
 * Every function returns an array the same length as its input, aligned
 * index-for-index with the candles; `null` marks the warm-up bars where the
 * indicator is not defined yet. Pure functions, no I/O, so they run the same
 * in the app, in tests and in backtests.
 */
import type { Candle } from '../psx/types';

export type Series = (number | null)[];

export const closes = (c: Candle[]) => c.map((b) => b.c);
export const volumes = (c: Candle[]) => c.map((b) => b.v);

/** Simple moving average. */
export function sma(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `n` values. Skips leading nulls. */
export function ema(values: Series | number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  const start = values.findIndex((v) => v != null);
  if (start < 0 || values.length - start < n) return out;
  let seed = 0;
  for (let i = start; i < start + n; i++) seed += values[i] as number;
  let prev = seed / n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < values.length; i++) {
    prev = (values[i] as number) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], n = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[n] = val();
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

export interface Macd {
  macd: Series;
  signal: Series;
  hist: Series;
}

export function macd(values: number[], fast = 12, slow = 26, sig = 9): Macd {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
  const signal = ema(line, sig);
  const hist: Series = line.map((m, i) => (m != null && signal[i] != null ? m - (signal[i] as number) : null));
  return { macd: line, signal, hist };
}

export interface Bands {
  mid: Series;
  upper: Series;
  lower: Series;
}

/** Bollinger bands (population standard deviation, as most charting sites use). */
export function bollinger(values: number[], n = 20, mult = 2): Bands {
  const mid = sma(values, n);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (values[j] - m) ** 2;
    const sd = Math.sqrt(v / n);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's Average True Range. */
export function atr(c: Candle[], n = 14): Series {
  const out: Series = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  const tr = c.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - c[i - 1].c), Math.abs(b.l - c[i - 1].c))));
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr[i];
  a /= n;
  out[n] = a;
  for (let i = n + 1; i < c.length; i++) {
    a = (a * (n - 1) + tr[i]) / n;
    out[i] = a;
  }
  return out;
}

/** On-balance volume. */
export function obv(c: Candle[]): number[] {
  const out: number[] = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) {
    const d = c[i].c - c[i - 1].c;
    out[i] = out[i - 1] + (d > 0 ? c[i].v : d < 0 ? -c[i].v : 0);
  }
  return out;
}

/** Last non-null value of a series, or null. */
export function last(s: Series, back = 0): number | null {
  const i = s.length - 1 - back;
  return i >= 0 ? s[i] : null;
}
