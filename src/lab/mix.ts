/** Two or three strategies run side by side with a share of the money each (separate pots, never moved between them). Pure. */
import type { Lab } from './data';
import { runBacktest, type Result, type Strategy } from './engine';

export interface MixPart {
  strategy: Strategy;
  /** share of the money, 0..1 */
  share: number;
}

export interface MixResult {
  start: number;
  value: Float64Array;
  invested: Float64Array;
  bench: Float64Array;
  growth: Float64Array;
  benchGrowth: Float64Array;
  parts: { name: string; share: number; result: Result }[];
  cagr: number;
  benchCagr: number;
  maxDrop: number;
  final: number;
  put: number;
}

export function runMix(lab: Lab, parts: MixPart[], lump: number, monthly: number): MixResult | null {
  const live = parts.filter((p) => p.share > 0);
  if (!live.length) return null;
  const total = live.reduce((a, p) => a + p.share, 0);
  // all pots start together, on the latest of their own first days
  const first = live.map((p) => runBacktest(lab, { ...p.strategy, lump: 1000, monthly: 0 }).start);
  const day = lab.days[Math.max(...first)];
  const results = live.map((p) => runBacktest(lab, { ...p.strategy, lump: (lump * p.share) / total, monthly: (monthly * p.share) / total, fromDay: day, until: undefined, untilDay: undefined }));
  const len = Math.min(...results.map((r) => r.value.length));
  const sum = (f: (r: Result) => Float64Array) => {
    const out = new Float64Array(len);
    for (const r of results) {
      const a = f(r);
      for (let t = 0; t < len; t++) out[t] += a[t];
    }
    return out;
  };
  const value = sum((r) => r.value);
  const invested = sum((r) => r.invested);
  const bench = sum((r) => r.bench);
  const tw = (v: Float64Array) => {
    const g = new Float64Array(len);
    g[0] = 1;
    for (let t = 1; t < len; t++) {
      const flow = invested[t] - invested[t - 1];
      g[t] = v[t - 1] > 0 ? g[t - 1] * ((v[t] - flow) / v[t - 1]) : g[t - 1];
    }
    return g;
  };
  const growth = tw(value);
  const benchGrowth = tw(bench);
  let peak = 0,
    maxDrop = 0;
  for (let t = 0; t < len; t++) {
    peak = Math.max(peak, growth[t]);
    maxDrop = Math.min(maxDrop, growth[t] / peak - 1);
  }
  const years = len / 252;
  return {
    start: results[0].start,
    value,
    invested,
    bench,
    growth,
    benchGrowth,
    parts: live.map((p, k) => ({ name: p.strategy.name, share: p.share / total, result: results[k] })),
    cagr: Math.pow(growth[len - 1], 1 / years) - 1,
    benchCagr: Math.pow(benchGrowth[len - 1], 1 / years) - 1,
    maxDrop,
    final: value[len - 1],
    put: invested[len - 1],
  };
}
