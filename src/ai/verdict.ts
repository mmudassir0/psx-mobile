/**
 * Sahm's verdict, decided in code.
 *
 * Small on-phone models are good at explaining and bad at weighing dozens of
 * numbers, so the call itself (direction, confidence, levels) is made here
 * from fixed, testable rules. The model is then asked to explain this
 * verdict, not to invent one.
 */
import type { StockPack } from './context';
import { median } from './context';

export type Call = 'Bullish' | 'Neutral' | 'Bearish';
export type Confidence = 'Low' | 'Medium' | 'High';

export interface Point {
  text: string;
  weight: number;
}

export interface Levels {
  kind: 'buy' | 'avoid';
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  target: number | null;
  /** reward ÷ risk from the middle of the entry zone */
  rr: number | null;
  /** price that would change the picture (break above resistance when bearish) */
  trigger: number | null;
}

export interface Verdict {
  call: Call;
  confidence: Confidence;
  technical: { score: number; stance: string } | null;
  fundamental: { score: number; label: 'Strong' | 'Fair' | 'Weak' } | null;
  combined: number;
  levels: Levels | null;
  bull: Point[];
  bear: Point[];
  headline: string;
}

const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${v.toFixed(1)}%`;

/** Fundamental votes from results, valuation and the balance sheet. */
export function fundamentalPoints(x: StockPack): { bull: Point[]; bear: Point[]; score: number | null } {
  const bull: Point[] = [];
  const bear: Point[] = [];
  const c = x.company;
  const s = x.stock;
  const pe = c?.pe ?? s?.pe ?? null;
  const peerPe = median(x.peers.map((q) => q.pe ?? NaN).filter((v) => v > 0));

  if (pe != null && pe > 0 && peerPe != null && x.peers.length >= 3) {
    if (pe < peerPe * 0.8) bull.push({ text: `P/E ${pe.toFixed(1)} is below the sector median of ${peerPe.toFixed(1)}`, weight: 1 });
    else if (pe > peerPe * 1.25) bear.push({ text: `P/E ${pe.toFixed(1)} is above the sector median of ${peerPe.toFixed(1)}`, weight: 1 });
  }
  if (pe != null && pe <= 0) bear.push({ text: 'The company is currently loss-making', weight: 1.5 });

  const growth = c?.ratios?.rows.find((r) => /eps growth/i.test(r.label))?.values[0] ?? null;
  if (growth != null) {
    if (growth >= 15) bull.push({ text: `Earnings per share grew ${pct(growth)} last year`, weight: 1 });
    else if (growth <= -10) bear.push({ text: `Earnings per share fell ${pct(Math.abs(growth))} last year`, weight: 1 });
  }

  // Latest quarter against the same quarter a year earlier (e.g. Q3 2026 vs Q3 2025).
  const q = c?.financialsQuarterly;
  const qEps = q?.rows.find((r) => /^eps$/i.test(r.label))?.values;
  if (q && qEps) {
    const [lab0] = q.periods;
    const m = lab0?.match(/^(Q\d)\s+(\d{4})$/);
    const j = m ? q.periods.findIndex((p) => p === `${m[1]} ${Number(m[2]) - 1}`) : -1;
    const now = qEps[0];
    const before = j > 0 ? qEps[j] : null;
    if (now != null && before != null && before > 0) {
      const ch = ((now - before) / before) * 100;
      if (ch >= 10) bull.push({ text: `${lab0} EPS ${f2(now)} is up ${pct(ch)} on a year earlier`, weight: 1 });
      else if (ch <= -10) bear.push({ text: `${lab0} EPS ${f2(now)} is down ${pct(Math.abs(ch))} on a year earlier`, weight: 1 });
    }
  }

  const r = x.ratios;
  if (x.balance && r) {
    if (r.roe != null) {
      if (r.roe >= 0.15) bull.push({ text: `Return on equity is a strong ${pct(r.roe * 100)}`, weight: 1 });
      else if (r.roe < 0.08) bear.push({ text: `Return on equity is a weak ${pct(r.roe * 100)}`, weight: 1 });
    }
    if (!x.balance.isBank) {
      if (r.debtToEquity != null && r.debtToEquity > 1) bear.push({ text: `Borrowings are ${pct(r.debtToEquity * 100)} of equity`, weight: 1 });
      else if (r.debtToEquity != null && r.debtToEquity < 0.3) bull.push({ text: `Low debt: borrowings are ${pct(r.debtToEquity * 100)} of equity`, weight: 0.5 });
      if (r.currentRatio != null && r.currentRatio < 1) bear.push({ text: `Current ratio ${f2(r.currentRatio)} is below 1`, weight: 0.5 });
    }
  }
  if (s?.divYield != null && s.divYield >= 6) bull.push({ text: `Dividend yield of ${pct(s.divYield)}`, weight: 0.5 });

  const total = [...bull, ...bear].reduce((a, p) => a + p.weight, 0);
  if (total < 1.5) return { bull, bear, score: null }; // too little evidence to score
  const net = bull.reduce((a, p) => a + p.weight, 0) - bear.reduce((a, p) => a + p.weight, 0);
  return { bull, bear, score: Math.round((5 + (5 * net) / total) * 10) / 10 };
}

export function decide(x: StockPack): Verdict | null {
  const a = x.analysis;
  if (!a) return null;
  const close = a.ind.close;
  const atr = a.ind.atr14 ?? close * 0.02;

  const tBull: Point[] = a.rules.filter((r) => r.vote > 0).map((r) => ({ text: r.reason, weight: r.weight }));
  const tBear: Point[] = a.rules.filter((r) => r.vote < 0).map((r) => ({ text: r.reason, weight: r.weight }));
  const fund = fundamentalPoints(x);

  const t = a.score;
  const fs = fund.score;
  const combined = Math.round((fs == null ? t : 0.6 * t + 0.4 * fs) * 10) / 10;
  const call: Call = combined >= 6 ? 'Bullish' : combined <= 4 ? 'Bearish' : 'Neutral';

  const dir = (v: number) => (v >= 6 ? 1 : v <= 4 ? -1 : 0);
  const agree = fs == null ? null : dir(t) === dir(fs);
  const strength = Math.abs(combined - 5);
  let confidence: Confidence = strength >= 2 ? 'High' : strength >= 1 ? 'Medium' : 'Low';
  if (agree === false && dir(t) !== 0 && dir(fs as number) !== 0) confidence = 'Low'; // technicals and fundamentals point opposite ways
  else if (fs == null && confidence === 'High') confidence = 'Medium'; // no fundamental confirmation

  // Levels for a long position. Stop sits half an ATR under support (or 2 ATR under the price).
  const sup = a.support?.price ?? null;
  const res = a.resistance?.price ?? null;
  const stop = sup != null && sup < close ? sup - 0.5 * atr : close - 2 * atr;
  let levels: Levels;
  if (call === 'Bearish') {
    levels = { kind: 'avoid', entryLow: null, entryHigh: null, stop: Math.min(stop, close - 0.5 * atr), target: null, rr: null, trigger: res };
  } else {
    const entryLow = sup != null && sup < close ? Math.max(sup, stop + 0.5 * atr) : close - atr;
    const entryHigh = Math.min(close, entryLow + atr);
    const target = res != null && res > close ? res : close + 2 * atr;
    const mid = (entryLow + entryHigh) / 2;
    const rr = mid > stop ? (target - mid) / (mid - stop) : null;
    levels = { kind: 'buy', entryLow, entryHigh, stop, target, rr: rr != null ? Math.round(rr * 10) / 10 : null, trigger: null };
  }

  const bull = [...tBull, ...fund.bull].sort((p, q) => q.weight - p.weight);
  const bear = [...tBear, ...fund.bear].sort((p, q) => q.weight - p.weight);
  const ft = fs == null ? null : { score: fs, label: (fs >= 6 ? 'Strong' : fs <= 4 ? 'Weak' : 'Fair') as 'Strong' | 'Fair' | 'Weak' };
  const tWord = t >= 6 ? 'positive' : t <= 4 ? 'negative' : 'mixed';
  const headline =
    ft == null
      ? `Technicals are ${tWord}; not enough company data to judge the fundamentals.`
      : `Technicals are ${tWord} and fundamentals look ${ft.label.toLowerCase()}${agree === false ? ', so the signals conflict' : ''}.`;

  return { call, confidence, technical: { score: t, stance: a.stance }, fundamental: ft, combined, levels, bull, bear, headline };
}

/** The verdict as text for the model to explain. */
export function verdictText(v: Verdict): string {
  const L: string[] = [];
  L.push(`SAHM VERDICT (decided by rules, already shown to the user): ${v.call}, confidence ${v.confidence}.`);
  L.push(`Technical score ${v.technical?.score.toFixed(1)}/10; fundamental score ${v.fundamental ? `${v.fundamental.score.toFixed(1)}/10 (${v.fundamental.label})` : 'not available'}; combined ${v.combined.toFixed(1)}/10.`);
  L.push(v.headline);
  const lv = v.levels;
  if (lv?.kind === 'buy') L.push(`Levels: buy zone Rs ${f2(lv.entryLow!)}–${f2(lv.entryHigh!)}, stop Rs ${f2(lv.stop!)}, target Rs ${f2(lv.target!)}, reward/risk ${lv.rr ?? 'n/a'}.`);
  if (lv?.kind === 'avoid') L.push(`Levels: no new buying; holders' stop Rs ${f2(lv.stop!)}${lv.trigger ? `; a close above Rs ${f2(lv.trigger)} would improve the picture` : ''}.`);
  L.push('For: ' + (v.bull.slice(0, 4).map((p) => p.text).join('; ') || 'nothing notable') + '.');
  L.push('Against: ' + (v.bear.slice(0, 4).map((p) => p.text).join('; ') || 'nothing notable') + '.');
  return L.join('\n');
}
