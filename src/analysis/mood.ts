/**
 * Market mood, 0 (extreme fear) to 100 (extreme greed), in the spirit of
 * CNN's Fear & Greed index but built from PSX data only. Six readings:
 *
 *   breadth    share of liquid stocks above their 200-day average
 *   highsLows  stocks at a 52-week high minus those at a 52-week low
 *   upVolume   money traded on up days, share of the last 10 days' total
 *   momentum   KSE-100 against its 125-day average
 *   fromHigh   KSE-100 against its 52-week high
 *   calm       KSE-100's 20-day swings, inverted (big swings = fear)
 *
 * Each reading is turned into a percentile of its own last three years (so
 * 80 means "higher than 80% of days since then"), and the score is their
 * average. That avoids made-up thresholds: a reading is only "greedy"
 * compared with how the PSX itself has behaved.
 */
import type { Candle, SeriesPoint } from '../psx/types';

export const MOOD_PARTS = ['breadth', 'highsLows', 'upVolume', 'momentum', 'fromHigh', 'calm'] as const;
export type MoodPart = (typeof MOOD_PARTS)[number];
export const PART_LABEL: Record<MoodPart, string> = {
  breadth: 'Stocks above their 200-day average',
  highsLows: '52-week highs vs lows',
  upVolume: 'Money traded on up days',
  momentum: 'KSE-100 vs its 125-day average',
  fromHigh: 'KSE-100 vs its 52-week high',
  calm: 'Calm vs big daily swings',
};

export interface MoodDay {
  day: string;
  score: number;
  /** 0-100 per part, in MOOD_PARTS order; null when not enough history */
  parts: (number | null)[];
}

export type MoodLabel = 'Extreme fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme greed';
export const moodLabel = (s: number): MoodLabel => (s < 25 ? 'Extreme fear' : s < 45 ? 'Fear' : s <= 55 ? 'Neutral' : s <= 75 ? 'Greed' : 'Extreme greed');
export const MOOD_BUCKETS: MoodLabel[] = ['Extreme fear', 'Fear', 'Neutral', 'Greed', 'Extreme greed'];

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** Percentile (0-100) of the last value among the values in the window, ignoring nulls. */
function pctRank(vals: (number | null)[], i: number, window: number, minN: number): number | null {
  const x = vals[i];
  if (x == null) return null;
  let below = 0;
  let equal = 0;
  let n = 0;
  for (let k = Math.max(0, i - window + 1); k <= i; k++) {
    const v = vals[k];
    if (v == null) continue;
    n++;
    if (v < x) below++;
    else if (v === x) equal++;
  }
  if (n < minN) return null;
  return Math.round(((below + equal / 2) / n) * 100);
}

/**
 * Mood for every index day that has enough history. `stocks` should be the
 * liquid PSX stocks with split-adjusted daily candles.
 */
export function moodHistory(
  index: SeriesPoint[],
  stocks: { candles: Candle[] }[],
  opts: { window?: number; minN?: number; minLiquidity?: number } = {},
): MoodDay[] {
  const window = opts.window ?? 750;
  const minN = opts.minN ?? 250;
  const minLiq = opts.minLiquidity ?? 5_000_000;
  const days = index.map((p) => pkDay(p.t));
  const dayAt = new Map(days.map((d, i) => [d, i]));
  const N = days.length;
  const above = new Array(N).fill(0);
  const hi = new Array(N).fill(0);
  const lo = new Array(N).fill(0);
  const count = new Array(N).fill(0);
  const upVal = new Array(N).fill(0);
  const totVal = new Array(N).fill(0);

  for (const s of stocks) {
    const c = s.candles;
    let sum200 = 0;
    const vals: number[] = [];
    for (let j = 0; j < c.length; j++) {
      sum200 += c[j].c;
      if (j >= 200) sum200 -= c[j - 200].c;
      vals.push(c[j].c * c[j].v);
      const di = dayAt.get(pkDay(c[j].t));
      if (di == null || j < 252) continue;
      // liquid that day: median traded value of the last 60 sessions
      const win = vals.slice(j - 59, j + 1).sort((a, b) => a - b);
      if (win[30] < minLiq) continue;
      const close = c[j].c;
      count[di]++;
      if (close > sum200 / 200) above[di]++;
      let mx = -Infinity;
      let mn = Infinity;
      for (let k = j - 251; k <= j; k++) {
        if (c[k].c > mx) mx = c[k].c;
        if (c[k].c < mn) mn = c[k].c;
      }
      if (close >= mx) hi[di]++;
      if (close <= mn) lo[di]++;
      const v = close * c[j].v;
      totVal[di] += v;
      if (close > c[j - 1].c) upVal[di] += v;
    }
  }

  const iv = index.map((p) => p.v);
  const raw: Record<MoodPart, (number | null)[]> = { breadth: [], highsLows: [], upVolume: [], momentum: [], fromHigh: [], calm: [] };
  let up10 = 0;
  let tot10 = 0;
  for (let i = 0; i < N; i++) {
    up10 += upVal[i];
    tot10 += totVal[i];
    if (i >= 10) {
      up10 -= upVal[i - 10];
      tot10 -= totVal[i - 10];
    }
    const enough = count[i] >= 20;
    raw.breadth.push(enough ? above[i] / count[i] : null);
    raw.highsLows.push(enough ? (hi[i] - lo[i]) / count[i] : null);
    raw.upVolume.push(i >= 9 && tot10 > 0 && enough ? up10 / tot10 : null);
    if (i >= 124) {
      let s = 0;
      for (let k = i - 124; k <= i; k++) s += iv[k];
      raw.momentum.push(iv[i] / (s / 125) - 1);
    } else raw.momentum.push(null);
    if (i >= 251) raw.fromHigh.push(iv[i] / Math.max(...iv.slice(i - 251, i + 1)) - 1);
    else raw.fromHigh.push(null);
    if (i >= 20) {
      const r: number[] = [];
      for (let k = i - 19; k <= i; k++) r.push(Math.log(iv[k] / iv[k - 1]));
      const m = r.reduce((a, b) => a + b, 0) / r.length;
      raw.calm.push(-Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length));
    } else raw.calm.push(null);
  }

  const out: MoodDay[] = [];
  for (let i = 0; i < N; i++) {
    const parts = MOOD_PARTS.map((k) => pctRank(raw[k], i, window, minN));
    const have = parts.filter((p): p is number => p != null);
    if (have.length < 4) continue;
    out.push({ day: days[i], score: Math.round(have.reduce((a, b) => a + b, 0) / have.length), parts });
  }
  return out;
}

export interface MoodOutcome {
  label: MoodLabel;
  /** days in this mood with a known return six months later */
  days: number;
  /** average KSE-100 change over the next ~6 months (126 sessions) */
  avg: number;
  /** share of those days followed by a gain */
  upShare: number;
}

/** What the KSE-100 did in the six months after each kind of mood. */
export function moodOutcomes(hist: MoodDay[], index: SeriesPoint[], ahead = 126): MoodOutcome[] {
  const at = new Map(index.map((p, i) => [pkDay(p.t), i]));
  const acc = new Map<MoodLabel, number[]>();
  for (const h of hist) {
    const i = at.get(h.day);
    if (i == null || i + ahead >= index.length) continue;
    const r = index[i + ahead].v / index[i].v - 1;
    const l = moodLabel(h.score);
    acc.set(l, [...(acc.get(l) ?? []), r]);
  }
  return MOOD_BUCKETS.filter((l) => (acc.get(l)?.length ?? 0) > 0).map((l) => {
    const r = acc.get(l)!;
    return { label: l, days: r.length, avg: r.reduce((a, b) => a + b, 0) / r.length, upShare: r.filter((x) => x > 0).length / r.length };
  });
}

/** The file the daily job writes (mood.json). */
export interface MoodFeed {
  v: 1;
  kind: 'mood';
  day: string;
  generatedAt: string;
  now: MoodDay;
  /** [day, score], oldest first, about two years */
  history: [string, number][];
  outcomes: MoodOutcome[];
  /** first day the outcomes cover */
  since?: string;
}

export const isMoodFeed = (x: unknown): x is MoodFeed => {
  const f = x as MoodFeed | null;
  return !!f && f.v === 1 && f.kind === 'mood' && typeof f.now?.score === 'number' && Array.isArray(f.history) && Array.isArray(f.outcomes);
};
