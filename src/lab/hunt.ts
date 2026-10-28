/**
 * Strategy hunt: tries many rule combinations on the earlier years (chosen on),
 * then checks every one on the later years it wasn't chosen on. The honest
 * question it answers: do the past winners keep winning? Pure, step by step, so
 * the screen can run it in small pieces and show progress.
 */
import type { Lab } from './data';
import { earliestYear, runBacktest, type Filter, type Metric, type Strategy, type Universe } from './engine';
import { BASE } from './templates';

export interface HuntIdea {
  strategy: Strategy;
  /** a year, the strategy and the index, on the years it was chosen on */
  train: { cagr: number; bench: number; drop: number };
  /** the same on the later years */
  test: { cagr: number; bench: number; drop: number } | null;
}

/** bumped when the list of ideas changes, so old saved hunts aren't matched to the wrong ideas */
export const HUNT_VERSION = 2;

export interface HuntSetup {
  v?: number;
  universe: Universe;
  /** first year of the later (check) period */
  split: number;
  from: number;
  tax: Strategy['tax'];
}

const RANKS: { rank: Metric; desc: boolean; label: string }[] = [
  { rank: 'mom12', desc: true, label: 'Up most in a year' },
  { rank: 'mom6', desc: true, label: 'Up most in 6 months' },
  { rank: 'mom3', desc: true, label: 'Up most in 3 months' },
  { rank: 'yield', desc: true, label: 'Highest yield' },
  { rank: 'vol', desc: false, label: 'Calmest' },
  { rank: 'off52h', desc: false, label: 'Furthest under the high' },
  { rank: 'off52h', desc: true, label: 'Closest to the high' },
  { rank: 'trend200', desc: true, label: 'Furthest above the 200-day' },
];
const FILTERS: { f: Filter[]; label: string; topSectors?: number }[] = [
  { f: [], label: '' },
  { f: [{ m: 'trend200', op: '>', v: 0 }], label: 'above the 200-day' },
  { f: [{ m: 'yield', op: '>', v: 4 }], label: 'yield over 4%' },
  { f: [{ m: 'yield', op: '>', v: 7 }], label: 'yield over 7%' },
  { f: [{ m: 'vol', op: '<', v: 35 }], label: 'calm (swings under 35%)' },
  { f: [{ m: 'mom12', op: '>', v: 0 }], label: 'up on the year' },
  { f: [], label: 'from the 3 best sectors', topSectors: 3 },
  {
    f: [
      { m: 'trend200', op: '>', v: 0 },
      { m: 'yield', op: '>', v: 4 },
    ],
    label: 'above the 200-day, yield over 4%',
  },
];
const HOLDS = [6, 10, 15];
const EVERY: Strategy['every'][] = [1, 3, 6];
const EXITS: { stop: number; exit200: boolean; pause?: number; label: string }[] = [
  { stop: 0, exit200: false, label: '' },
  { stop: 0.2, exit200: false, label: '20% stop' },
  { stop: 0, exit200: true, label: 'out under the 200-day' },
  { stop: 0, exit200: false, pause: 0.4, label: 'cash in weak markets' },
];
const EVERY_LABEL = { 1: 'monthly', 3: 'every 3 months', 6: 'every 6 months', 12: 'yearly' } as const;

/** Every combination, in a fixed shuffled order (the same each time), so a hunt can stop early and continue. */
export function ideas(setup: HuntSetup): Strategy[] {
  const out: Strategy[] = [];
  for (const r of RANKS)
    for (const f of FILTERS)
      for (const hold of HOLDS)
        for (const every of EVERY)
          for (const x of EXITS) {
            // a yield filter ranked by yield is the same as ranking by yield
            if (r.rank === 'yield' && f.f.some((y) => y.m === 'yield') && f.f.length === 1) continue;
            const name = [`${r.label}, ${hold}`, f.label, EVERY_LABEL[every], x.label].filter(Boolean).join(' · ');
            out.push({
              ...BASE,
              id: `hunt-${out.length}`,
              name,
              universe: setup.universe,
              minValue: 3,
              filters: f.f,
              rank: r.rank,
              desc: r.desc,
              hold,
              every,
              stop: x.stop,
              exit200: x.exit200,
              ...(x.pause ? { pauseBelow: x.pause } : {}),
              ...(f.topSectors ? { topSectors: f.topSectors } : {}),
              cashEarns: true,
              perSector: 3,
              lump: 100000,
              monthly: 0,
              costs: true,
              tax: setup.tax,
              from: setup.from,
              bench: setup.universe === 'shariah' || setup.universe === 'kmi30' ? 'KMI30' : 'KSE100',
            });
          }
  // fixed shuffle
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Runs one idea on both periods. */
export function tryIdea(lab: Lab, st: Strategy, setup: HuntSetup): HuntIdea {
  const a = runBacktest(lab, { ...st, from: setup.from, until: setup.split });
  const last = Number(lab.days[lab.days.length - 1].slice(0, 4));
  const b = setup.split <= last ? runBacktest(lab, { ...st, from: setup.split }) : null;
  return {
    strategy: st,
    train: { cagr: a.stats.cagr, bench: a.stats.benchCagr, drop: a.stats.maxDrop },
    test: b && b.value.length > 120 ? { cagr: b.stats.cagr, bench: b.stats.benchCagr, drop: b.stats.maxDrop } : null,
  };
}

export const edge = (p: { cagr: number; bench: number }) => p.cagr - p.bench;
/** chosen on: beating the index, with deep falls counting against */
export const trainScore = (x: HuntIdea) => edge(x.train) + 0.15 * x.train.drop;

export interface HuntSummary {
  tried: number;
  top: HuntIdea[];
  /** of the top ones, how many also beat the index later */
  topHeld: number;
  /** of all, how many beat the index later */
  allHeld: number;
  /** average later edge: the top ones, and everything tried */
  topLater: number;
  allLater: number;
  /** the best on the later years, to show how different they were */
  bestLater: HuntIdea | null;
}

export function summarise(all: HuntIdea[], topN = 12): HuntSummary {
  const tested = all.filter((x) => x.test);
  const top = [...all].sort((a, b) => trainScore(b) - trainScore(a)).slice(0, topN);
  const avg = (xs: HuntIdea[]) => (xs.length ? xs.reduce((a, x) => a + edge(x.test!), 0) / xs.length : 0);
  const topT = top.filter((x) => x.test);
  return {
    tried: all.length,
    top,
    topHeld: topT.filter((x) => edge(x.test!) > 0).length,
    allHeld: tested.filter((x) => edge(x.test!) > 0).length,
    topLater: avg(topT),
    allLater: avg(tested),
    bestLater: tested.length ? [...tested].sort((a, b) => edge(b.test!) - edge(a.test!))[0] : null,
  };
}

/** The default split: the later period is the last three-and-a-bit years. */
export function defaultSetup(lab: Lab, universe: Universe = 'all'): HuntSetup {
  const last = Number(lab.days[lab.days.length - 1].slice(0, 4));
  const from = earliestYear(lab);
  return { v: HUNT_VERSION, universe, from, split: Math.max(from + 3, last - 3), tax: 'filer' };
}
