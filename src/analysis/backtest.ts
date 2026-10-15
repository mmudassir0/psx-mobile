/**
 * Backtest of Sahm's technical score on one stock's own history.
 *
 * For every past trading day, the rules are evaluated with only the data
 * available that day (`rulesAt`), then compared with what the price actually
 * did 5, 10 and 20 trading days later. The baseline is the same stock on
 * every day, so an edge means "better than just holding this stock".
 *
 * Fundamentals are not included: their history isn't available day by day.
 */
import type { Candle } from '../psx/types';
import { computeSeries, rulesAt, SeriesSet, Stance, stanceFor } from './signals';

export const HORIZONS = [5, 10, 20] as const;
export type Horizon = (typeof HORIZONS)[number];
/** Round-trip trading cost assumed for a buy: commission, CVT and spread, both ways. */
export const COST = 0.003;

export interface Outcome {
  /** trading days counted */
  days: number;
  /** share of those days the price was higher after the horizon, 0..1 */
  up: number;
  /** average change over the horizon, as a fraction */
  avg: number;
}

export type Group = 'bullish' | 'neutral' | 'bearish';
export const groupOf = (s: Stance): Group =>
  s === 'Bullish' || s === 'Strong bullish' ? 'bullish' : s === 'Bearish' || s === 'Strong bearish' ? 'bearish' : 'neutral';

export interface RuleStat {
  id: string;
  name: string;
  /** 10-day outcome on days the rule voted bullish / bearish */
  bull: Outcome;
  bear: Outcome;
}

export interface Calls {
  /** times the score turned into this group */
  events: number;
  /** of those, share where the 10-day move went the called way */
  right: number;
  /** average 10-day change after the call (after costs for bullish calls) */
  avg: number;
}

export interface Backtest {
  from: number;
  to: number;
  base: Record<Horizon, Outcome>;
  groups: Record<Group, Record<Horizon, Outcome>>;
  stances: Partial<Record<Stance, Outcome>>; // 10-day
  calls: { bullish: Calls; bearish: Calls };
  rules: RuleStat[];
}

class Acc {
  n = 0;
  up = 0;
  sum = 0;
  add(r: number) {
    this.n++;
    if (r > 0) this.up++;
    this.sum += r;
  }
  get(): Outcome {
    return { days: this.n, up: this.n ? this.up / this.n : 0, avg: this.n ? this.sum / this.n : 0 };
  }
}

const perHorizon = () => Object.fromEntries(HORIZONS.map((h) => [h, new Acc()])) as Record<Horizon, Acc>;
const done = (x: Record<Horizon, Acc>) => Object.fromEntries(HORIZONS.map((h) => [h, x[h].get()])) as Record<Horizon, Outcome>;

/** Minimum history: 200 days to warm up the long average plus a year to test on. */
export const MIN_HISTORY = 450;

export function backtest(candles: Candle[], series?: SeriesSet): Backtest | null {
  const S = series ?? computeSeries(candles);
  const { c, cl } = S;
  const start = S.e200.findIndex((v) => v != null);
  if (start < 0 || c.length < MIN_HISTORY) return null;
  const last = c.length - 1;

  const base = perHorizon();
  const groups = { bullish: perHorizon(), neutral: perHorizon(), bearish: perHorizon() };
  const stances = new Map<Stance, Acc>();
  const rules = new Map<string, { name: string; bull: Acc; bear: Acc }>();
  const calls = { bullish: { events: 0, right: 0, sum: 0 }, bearish: { events: 0, right: 0, sum: 0 } };
  let prev: Group | null = null;

  for (let i = start; i < last; i++) {
    const { rules: rs, score } = rulesAt(S, i);
    const stance = stanceFor(score);
    const g = groupOf(stance);
    for (const h of HORIZONS) {
      if (i + h > last) continue;
      const r = cl[i + h] / cl[i] - 1;
      base[h].add(r);
      groups[g][h].add(r);
    }
    if (i + 10 <= last) {
      const r10 = cl[i + 10] / cl[i] - 1;
      if (!stances.has(stance)) stances.set(stance, new Acc());
      stances.get(stance)!.add(r10);
      for (const rule of rs) {
        if (!rule.vote) continue;
        if (!rules.has(rule.id)) rules.set(rule.id, { name: rule.name, bull: new Acc(), bear: new Acc() });
        (rule.vote > 0 ? rules.get(rule.id)!.bull : rules.get(rule.id)!.bear).add(r10);
      }
      // A call = the day the score moves into bullish or bearish territory.
      if (g !== 'neutral' && g !== prev) {
        const k = calls[g];
        k.events++;
        if (g === 'bullish') {
          const net = r10 - COST;
          if (net > 0) k.right++;
          k.sum += net;
        } else {
          if (r10 < 0) k.right++;
          k.sum += r10;
        }
      }
    }
    prev = g;
  }

  const fin = (k: { events: number; right: number; sum: number }): Calls => ({
    events: k.events,
    right: k.events ? k.right / k.events : 0,
    avg: k.events ? k.sum / k.events : 0,
  });
  return {
    from: c[start].t,
    to: c[last].t,
    base: done(base),
    groups: { bullish: done(groups.bullish), neutral: done(groups.neutral), bearish: done(groups.bearish) },
    stances: Object.fromEntries([...stances].map(([s, a]) => [s, a.get()])),
    calls: { bullish: fin(calls.bullish), bearish: fin(calls.bearish) },
    rules: [...rules].map(([id, v]) => ({ id, name: v.name, bull: v.bull.get(), bear: v.bear.get() })),
  };
}

/**
 * How the current call has done in the past, in words, for the verdict card
 * and the AI. Null when there are too few comparable days to say anything.
 */
export interface TrackRecord {
  group: Group;
  days: number;
  /** share of days the price moved the called way after 10 days (rose for bullish, fell for bearish, rose for neutral) */
  rate: number;
  /** same measure on all days, for comparison */
  baseRate: number;
  avg: number;
  baseAvg: number;
  /** the call beat simply holding the stock by a meaningful margin */
  edge: 'better' | 'similar' | 'worse';
  years: number;
}

export function trackRecord(bt: Backtest, stance: Stance, h: Horizon = 10): TrackRecord | null {
  const g = groupOf(stance);
  const o = bt.groups[g][h];
  const b = bt.base[h];
  if (o.days < 40) return null;
  const rate = g === 'bearish' ? 1 - o.up : o.up;
  const baseRate = g === 'bearish' ? 1 - b.up : b.up;
  // For a bullish call, beating the stock means a higher average; for bearish, a lower one.
  const diff = g === 'bearish' ? b.avg - o.avg : o.avg - b.avg;
  const edge = g === 'neutral' ? 'similar' : diff > 0.005 ? 'better' : diff < -0.005 ? 'worse' : 'similar';
  return { group: g, days: o.days, rate, baseRate, avg: o.avg, baseAvg: b.avg, edge, years: (bt.to - bt.from) / (365.25 * 864e5) };
}
