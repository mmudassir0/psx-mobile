/**
 * Would Sahm's own warnings have helped? Ten years of month-starts: for every
 * stock, the warnings Sahm's holding review gives from prices and dividends
 * alone (below the 200-day average on 10 of 15 days, a death cross, a dividend
 * cut), then what the stock did next against the average stock that month.
 * Earnings-based warnings aren't here: Sahm doesn't have ten years of results.
 */
import type { Lab, LabStock } from './data';
import { earliestYear, firstDayOf, runBacktest, type Strategy, type Universe } from './engine';
import { BASE } from './templates';

export type Group = 'chart' | 'cut' | 'uptrend' | 'clear';
export const GROUP_LABEL: Record<Group, string> = {
  chart: 'Chart warning (under its 200-day average, or a death cross)',
  cut: 'Dividend cut by half or more',
  uptrend: 'Above its 200-day average, no warning',
  clear: 'Under its 200-day average, but no warning yet',
};
export const HORIZONS = [1, 3, 6, 12] as const;

export interface GroupStat {
  /** stock-months in the group */
  n: number;
  /** average return over the next months, minus the average stock's, by horizon */
  edge: number[];
  /** share of times it did better than the middle stock that month */
  beat: number[];
}

const ema = (c: Float64Array, span: number): Float64Array => {
  const out = new Float64Array(c.length).fill(NaN);
  const k = 2 / (span + 1);
  let e = NaN,
    seen = 0;
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (!(v > 0)) continue;
    e = Number.isNaN(e) ? v : v * k + e * (1 - k);
    seen++;
    if (seen >= span) out[i] = e;
  }
  return out;
};

interface Prep {
  s: LabStock;
  e50: Float64Array;
  e200: Float64Array;
  /** cumulative dividends to each day */
  div: Float64Array;
}

function prep(s: LabStock): Prep {
  const div = new Float64Array(s.close.length + 1);
  const at = new Map<number, number>();
  for (const d of s.divs) at.set(d.i, (at.get(d.i) ?? 0) + d.dps);
  for (let i = 0; i < s.close.length; i++) div[i + 1] = div[i] + (at.get(i) ?? 0);
  return { s, e50: ema(s.close, 50), e200: ema(s.close, 200), div };
}

/** Which group a stock is in at the close of day `i`. Null: not enough history. */
export function groupAt(p: Prep, i: number): Group | null {
  const c = p.s.close;
  if (!(c[i] > 0) || Number.isNaN(p.e200[i]) || i < 520) return null;
  // dividend cut: the last 12 months under half the 12 before, which paid something
  const last = p.div[i + 1] - p.div[i - 251];
  const prev = p.div[i - 251] - p.div[i - 503];
  if (prev > 0 && last <= prev * 0.5) return 'cut';
  let below = 0;
  for (let k = i - 14; k <= i; k++) if (c[k] < p.e200[k]) below++;
  let cross = false;
  for (let k = i - 19; k <= i; k++) if (p.e50[k - 1] >= p.e200[k - 1] && p.e50[k] < p.e200[k]) cross = true;
  if ((c[i] < p.e200[i] && below >= 10) || cross) return 'chart';
  return c[i] > p.e200[i] ? 'uptrend' : 'clear';
}

export interface ReviewTest {
  groups: Record<Group, GroupStat>;
  months: number;
  stocks: number;
  /** holding everything equally against the same but out of stocks under their 200-day average */
  hold: { cagr: number; drop: number };
  act: { cagr: number; drop: number };
  bench: number;
  from: string;
}

export function reviewTest(lab: Lab, universe: Universe = 'kse100', minValue = 3): ReviewTest {
  const stocks = lab.stocks.filter((s) => (universe === 'all' ? true : universe === 'kse100' ? s.kse100 : universe === 'kmi30' ? s.kmi30 : s.shariah));
  const preps = stocks.map(prep);
  const start = firstDayOf(lab, earliestYear(lab));
  const n = lab.days.length;
  const sums: Record<Group, { n: number; e: number[]; b: number[] }> = {
    chart: { n: 0, e: [0, 0, 0, 0], b: [0, 0, 0, 0] },
    cut: { n: 0, e: [0, 0, 0, 0], b: [0, 0, 0, 0] },
    uptrend: { n: 0, e: [0, 0, 0, 0], b: [0, 0, 0, 0] },
    clear: { n: 0, e: [0, 0, 0, 0], b: [0, 0, 0, 0] },
  };
  const counts: Record<Group, number[]> = { chart: [0, 0, 0, 0], cut: [0, 0, 0, 0], uptrend: [0, 0, 0, 0], clear: [0, 0, 0, 0] };
  let months = 0;
  for (let i = start; i < n - 21; i++) {
    if (lab.month[i] === lab.month[i - 1]) continue;
    months++;
    const d = i - 1; // decided on yesterday's close
    const rows: { g: Group; fwd: (number | null)[] }[] = [];
    for (const p of preps) {
      const mi = lab.month[i] - 1;
      if (minValue > 0 && !(mi >= 0 && p.s.value[mi] >= minValue * 1e6)) continue;
      const g = groupAt(p, d);
      if (!g) continue;
      const fwd = HORIZONS.map((h) => {
        const j = i + h * 21;
        const a = p.s.close[i],
          b = p.s.close[j];
        if (j >= n || !(a > 0) || !(b > 0)) return null;
        return (b + (p.div[j + 1] - p.div[i + 1])) / a - 1;
      });
      rows.push({ g, fwd });
    }
    HORIZONS.forEach((_, h) => {
      const xs = rows.filter((r) => r.fwd[h] != null);
      if (xs.length < 5) return;
      const avg = xs.reduce((a, r) => a + r.fwd[h]!, 0) / xs.length;
      const sorted = xs.map((r) => r.fwd[h]!).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      for (const r of xs) {
        const e = r.fwd[h]! - avg;
        sums[r.g].e[h] += e;
        sums[r.g].b[h] += r.fwd[h]! > med ? 1 : 0;
        counts[r.g][h]++;
      }
    });
    for (const r of rows) sums[r.g].n++;
  }
  const groups = Object.fromEntries(
    (Object.keys(sums) as Group[]).map((g) => [g, { n: sums[g].n, edge: sums[g].e.map((v, h) => (counts[g][h] ? v / counts[g][h] : 0)), beat: sums[g].b.map((v, h) => (counts[g][h] ? v / counts[g][h] : 0)) }]),
  ) as Record<Group, GroupStat>;
  const base: Strategy = {
    ...BASE,
    id: 'rv',
    name: 'All',
    universe,
    minValue,
    rank: 'value',
    desc: true,
    hold: 200,
    every: 1,
    perSector: 0,
    filters: [],
    lump: 100000,
    monthly: 0,
    bench: universe === 'shariah' || universe === 'kmi30' ? 'KMI30' : 'KSE100',
  };
  const a = runBacktest(lab, base);
  const b = runBacktest(lab, { ...base, filters: [{ m: 'trend200', op: '>', v: 0 }], exit200: true });
  return {
    groups,
    months,
    stocks: stocks.length,
    hold: { cagr: a.stats.cagr, drop: a.stats.maxDrop },
    act: { cagr: b.stats.cagr, drop: b.stats.maxDrop },
    bench: a.stats.benchCagr,
    from: lab.days[start],
  };
}
