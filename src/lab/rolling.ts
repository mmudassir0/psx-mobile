/**
 * Every start date: the same strategy begun in each month, held for the same
 * number of years, so luck in when you happened to start shows up. Pure.
 */
import type { Lab } from './data';
import { earliestYear, firstDayOf, runBacktest, type Strategy } from './engine';

export interface RollRow {
  /** YYYY-MM of the start */
  start: string;
  cagr: number;
  bench: number;
  drop: number;
}

export interface Rolling {
  years: number;
  rows: RollRow[];
  /** share of starts that beat the index */
  ahead: number;
  best: RollRow;
  worst: RollRow;
  median: number;
  medianBench: number;
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const k = y * 12 + m - 1 + n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
};

/** Start months between the first possible and `years` before the end; `step` months apart. */
export function rollStarts(lab: Lab, years: number, step = 1): string[] {
  const first = lab.days[firstDayOf(lab, earliestYear(lab))].slice(0, 7);
  const last = addMonths(lab.days[lab.days.length - 1].slice(0, 7), -12 * years);
  const out: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, step)) out.push(m);
  return out;
}

export function rollOne(lab: Lab, st: Strategy, start: string, years: number): RollRow {
  const r = runBacktest(lab, { ...st, lump: 100000, monthly: 0, fromDay: `${start}-01`, untilDay: `${addMonths(start, 12 * years)}-01` });
  return { start, cagr: r.stats.cagr, bench: r.stats.benchCagr, drop: r.stats.maxDrop };
}

export function summariseRolling(rows: RollRow[], years: number): Rolling | null {
  if (!rows.length) return null;
  const by = (f: (r: RollRow) => number) => [...rows].sort((a, b) => f(a) - f(b));
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  return {
    years,
    rows,
    ahead: rows.filter((r) => r.cagr > r.bench).length / rows.length,
    best: by((r) => -r.cagr)[0],
    worst: by((r) => r.cagr)[0],
    median: mid(rows.map((r) => r.cagr)),
    medianBench: mid(rows.map((r) => r.bench)),
  };
}
