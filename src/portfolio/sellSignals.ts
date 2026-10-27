/**
 * Every holding with a warning, in one list: past your rethink price, marked
 * Review or Trim, a broken chart, a dividend cut, or profits down. Strongest
 * first. Information to look again at, not an instruction to sell.
 */
export interface SignalIn {
  symbol: string;
  price: number;
  value: number;
  pnlPct: number | null;
  action: string | null;
  headline: string | null;
  fundamentalBreaks: string[];
  technicalBreaks: string[];
  rethink: number | null;
  target: number | null;
  divCut: string | null;
  divLower: string | null;
  /** latest results against a year earlier, as a fraction */
  epsChange: number | null;
  resultsPeriod: string | null;
}
export interface Signal {
  text: string;
  weight: number;
  kind: 'rethink' | 'review' | 'chart' | 'dividend' | 'results' | 'target';
}
export interface Flagged {
  symbol: string;
  value: number;
  pnlPct: number | null;
  score: number;
  signals: Signal[];
}

const pc = (v: number) => `${Math.abs(v * 100).toFixed(0)}%`;

export function signalsOf(x: SignalIn): Signal[] {
  const out: Signal[] = [];
  if (x.rethink != null && x.price > 0 && x.price <= x.rethink) out.push({ kind: 'rethink', weight: 3, text: `At Rs ${x.price.toFixed(2)}, under your rethink price of Rs ${x.rethink.toFixed(2)}` });
  if (x.action === 'Review') out.push({ kind: 'review', weight: 3, text: x.headline ?? 'Marked Review' });
  else if (x.action === 'Trim') out.push({ kind: 'review', weight: 2, text: x.headline ?? 'Marked Trim: a large share of your money' });
  for (const f of x.fundamentalBreaks.slice(0, 2)) if (!out.some((s) => s.text === f)) out.push({ kind: 'review', weight: 2, text: f });
  if (x.technicalBreaks.length) out.push({ kind: 'chart', weight: 1, text: x.technicalBreaks[0] });
  if (x.divCut) out.push({ kind: 'dividend', weight: 2, text: x.divCut });
  else if (x.divLower) out.push({ kind: 'dividend', weight: 1, text: x.divLower });
  if (x.epsChange != null && x.epsChange <= -0.05)
    out.push({ kind: 'results', weight: x.epsChange <= -0.2 ? 2 : 1, text: `Earnings per share down ${pc(x.epsChange)}${x.resultsPeriod ? ` in ${x.resultsPeriod}` : ''} against a year earlier` });
  if (x.target != null && x.price >= x.target) out.push({ kind: 'target', weight: 1, text: `Reached your target of Rs ${x.target.toFixed(2)}: time to look again` });
  return out;
}

export function sellSignals(list: SignalIn[]): { flagged: Flagged[]; clear: string[] } {
  const flagged: Flagged[] = [];
  const clear: string[] = [];
  for (const x of list) {
    const signals = signalsOf(x).sort((a, b) => b.weight - a.weight);
    if (!signals.length) clear.push(x.symbol);
    else flagged.push({ symbol: x.symbol, value: x.value, pnlPct: x.pnlPct, score: signals.reduce((a, s) => a + s.weight, 0), signals });
  }
  flagged.sort((a, b) => b.score - a.score || b.value - a.value);
  return { flagged, clear: clear.sort() };
}
