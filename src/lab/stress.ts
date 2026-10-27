/** The market's worst falls since the lab's data starts, and how a strategy did through each and in the six months after. Pure. */
import type { Lab } from './data';
import type { Result } from './engine';

export interface Fall {
  from: string;
  to: string;
  /** the index (with its dividends) from its peak to its low, and the strategy over the same days */
  index: number;
  strategy: number;
  /** the six months after the low */
  indexAfter: number | null;
  strategyAfter: number | null;
}

/** Up to `max` separate falls of the benchmark of at least `min` (0.15 = 15%), deepest first, from a result's own curves. */
export function worstFalls(lab: Lab, r: Result, min = 0.15, max = 4): Fall[] {
  const b = r.benchGrowth;
  const g = r.growth;
  const eps: { p: number; t: number; d: number }[] = [];
  let peak = 0;
  let cur: { p: number; t: number; d: number } | null = null;
  for (let i = 0; i < b.length; i++) {
    if (b[i] >= b[peak]) {
      if (cur && cur.d <= -min) eps.push(cur);
      cur = null;
      peak = i;
      continue;
    }
    const d = b[i] / b[peak] - 1;
    if (!cur || d < cur.d) cur = { p: peak, t: i, d };
  }
  if (cur && cur.d <= -min) eps.push(cur);
  const after = (a: Float64Array, t: number) => (t + 126 < a.length ? a[t + 126] / a[t] - 1 : null);
  return eps
    .sort((x, y) => x.d - y.d)
    .slice(0, max)
    .map((e) => ({
      from: lab.days[r.start + e.p],
      to: lab.days[r.start + e.t],
      index: e.d,
      strategy: g[e.t] / g[e.p] - 1,
      indexAfter: after(b, e.t),
      strategyAfter: after(g, e.t),
    }))
    .sort((x, y) => (x.from < y.from ? -1 : 1));
}
