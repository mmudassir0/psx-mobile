/** The same strategy with small changes and over each half of the period, to see whether the result is luck. */
import type { Lab } from './data';
import { earliestYear, runBacktest, type Result, type Strategy } from './engine';

export interface Variant {
  label: string;
  cagr: number;
  bench: number;
}

export function robustness(lab: Lab, st: Strategy, base: Result): Variant[] {
  const out: Variant[] = [{ label: 'As you set it', cagr: base.stats.cagr, bench: base.stats.benchCagr }];
  const tryIt = (label: string, s: Partial<Strategy>) => {
    try {
      const r = runBacktest(lab, { ...st, ...s });
      if (r.value.length > 120) out.push({ label, cagr: r.stats.cagr, bench: r.stats.benchCagr });
    } catch {
      // skip
    }
  };
  if (st.hold > 3) tryIt(`Holding ${Math.max(1, st.hold - Math.ceil(st.hold / 3))} instead of ${st.hold}`, { hold: Math.max(1, st.hold - Math.ceil(st.hold / 3)) });
  tryIt(`Holding ${st.hold + Math.max(2, Math.ceil(st.hold / 2))} instead of ${st.hold}`, { hold: st.hold + Math.max(2, Math.ceil(st.hold / 2)) });
  const alt = st.every === 1 ? 3 : st.every === 3 ? 1 : 3;
  tryIt(alt === 1 ? 'Checked every month' : 'Checked every three months', { every: alt });
  const first = Math.max(st.from, earliestYear(lab));
  const last = Number(lab.days[lab.days.length - 1].slice(0, 4));
  const mid = Math.round((first + last + 1) / 2);
  if (mid - first >= 2 && last + 1 - mid >= 2) {
    tryIt(`Only ${first}–${mid - 1}`, { from: first, until: mid });
    tryIt(`Only ${mid}–${last}`, { from: mid });
  }
  return out;
}
