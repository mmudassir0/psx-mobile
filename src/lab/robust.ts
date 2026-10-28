/** The same strategy with small changes and over each half of the period, to see whether the result is luck. */
import type { Lab } from './data';
import { earliestYear, runBacktest, type Result, type Strategy } from './engine';

export interface Variant {
  label: string;
  cagr: number;
  bench: number;
}

/** The changed versions to try, with their labels. */
export function variantsOf(lab: Lab, st: Strategy): [string, Strategy][] {
  const out: [string, Strategy][] = [];
  if (!st.only && st.hold > 3) out.push([`Holding ${Math.max(1, st.hold - Math.ceil(st.hold / 3))} instead of ${st.hold}`, { ...st, hold: Math.max(1, st.hold - Math.ceil(st.hold / 3)) }]);
  if (!st.only) out.push([`Holding ${st.hold + Math.max(2, Math.ceil(st.hold / 2))} instead of ${st.hold}`, { ...st, hold: st.hold + Math.max(2, Math.ceil(st.hold / 2)) }]);
  const alt = st.every === 1 ? 3 : st.every === 3 ? 1 : 3;
  out.push([alt === 1 ? 'Checked every month' : 'Checked every three months', { ...st, every: alt }]);
  const first = Math.max(st.from, earliestYear(lab));
  const last = Number(lab.days[lab.days.length - 1].slice(0, 4));
  const mid = Math.round((first + last + 1) / 2);
  if (mid - first >= 2 && last + 1 - mid >= 2) {
    out.push([`Only ${first}–${mid - 1}`, { ...st, from: first, until: mid }]);
    out.push([`Only ${mid}–${last}`, { ...st, from: mid }]);
  }
  return out;
}

/** One variant's figures, or null if it can't run or is too short to mean much. */
export function runVariant(lab: Lab, label: string, s: Strategy, run: (lab: Lab, s: Strategy) => Result = runBacktest): Variant | null {
  try {
    const r = run(lab, s);
    return r.value.length > 120 ? { label, cagr: r.stats.cagr, bench: r.stats.benchCagr } : null;
  } catch {
    return null;
  }
}

export function robustness(lab: Lab, st: Strategy, base: Result): Variant[] {
  const out: Variant[] = [{ label: 'As you set it', cagr: base.stats.cagr, bench: base.stats.benchCagr }];
  for (const [label, s] of variantsOf(lab, st)) {
    const v = runVariant(lab, label, s);
    if (v) out.push(v);
  }
  return out;
}
