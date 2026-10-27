/**
 * A stock against the other companies in its sector: where its P/E, dividend
 * yield, 1-year change and return on equity sit among them, and a plain verdict
 * on whether it looks cheap for its sector.
 */
import { MIN_PE } from './screener';

export interface PeerFigures {
  symbol: string;
  pe: number | null;
  divYield: number | null;
  change1y: number | null;
  roe: number | null;
  marketCap: number | null;
}

export interface Measure {
  key: 'pe' | 'divYield' | 'change1y' | 'roe';
  label: string;
  value: number | null;
  median: number | null;
  /** how many peers have the figure */
  n: number;
  /** share of peers this one beats (lower P/E, higher yield/ROE/change), 0–1 */
  beats: number | null;
  /** 1 = best in the sector */
  rank: number | null;
}

const med = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const LABEL = { pe: 'P/E', divYield: 'Dividend yield', change1y: '1-year change', roe: 'Return on equity' } as const;

export function peerCompare(me: PeerFigures, peers: PeerFigures[]): { measures: Measure[]; verdict: 'cheap' | 'dear' | 'usual' | null; size: { rank: number; of: number } } {
  const ok = (k: Measure['key'], x: PeerFigures) => {
    const v = x[k];
    if (v == null || !Number.isFinite(v)) return null;
    if (k === 'pe' && v < MIN_PE) return null;
    return v;
  };
  const measures: Measure[] = (['pe', 'divYield', 'change1y', 'roe'] as const).map((k) => {
    const others = peers.map((p) => ok(k, p)).filter((v): v is number => v != null);
    const value = ok(k, me);
    const better = (a: number, b: number) => (k === 'pe' ? a < b : a > b);
    const beats = value != null && others.length ? others.filter((o) => better(value, o)).length / others.length : null;
    const rank = value != null ? others.filter((o) => better(o, value)).length + 1 : null;
    return { key: k, label: LABEL[k], value, median: med(others), n: others.length, beats, rank };
  });
  const pe = measures[0];
  const dy = measures[1];
  let verdict: 'cheap' | 'dear' | 'usual' | null = null;
  if (pe.beats != null && pe.n >= 3) {
    const score = pe.beats - 0.5 + (dy.beats != null && dy.n >= 3 ? (dy.beats - 0.5) * 0.5 : 0);
    verdict = score > 0.25 ? 'cheap' : score < -0.25 ? 'dear' : 'usual';
  }
  const caps = [me, ...peers].filter((p) => p.marketCap != null).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  return { measures, verdict, size: { rank: caps.findIndex((p) => p.symbol === me.symbol) + 1, of: caps.length } };
}
