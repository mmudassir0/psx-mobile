/** Backtests asked for in the AI chat: spotting the question, and the lab's result as text for the AI to answer from. Pure. */
import type { Lab } from './data';
import type { Result, Strategy } from './engine';
import { describe } from './describe';

/** "How did buying banks after a 20% fall do?", "backtest…", "if I had bought… since 2019" */
export const isLabQuestion = (q: string) =>
  /\bback-?test|\bstrateg(y|ies)\b|\bwould (i|it|that|this) have\b|\bif i (had|have) (bought|invested|followed|held)\b|\bhow (did|would|does|has)\b.*\b(do|done|perform|performed|work|worked|returned)\b.*\b(since|over the last|past|years?|20[12]\d)\b|\bsince 20[12]\d\b.*\b(buy|bought|hold|held|strategy|rule)/i.test(
    q,
  );

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v * 100).toFixed(d)}%`;

export function labResultText(lab: Lab, st: Strategy, r: Result): string {
  const benchName = st.bench === 'KMI30' ? 'KMI-30' : 'KSE-100';
  const s = r.stats;
  const top = r.bySymbol.slice(0, 3).map((x) => `${x.symbol} Rs ${Math.round(x.pnl).toLocaleString('en-US')}`);
  return [
    "SAHM BACKTESTING LAB RESULT (computed by the app from PSX prices and dividends; quote these numbers, don't invent others):",
    `Rules: ${describe(st)}`,
    `Period: ${lab.days[r.start]} to ${lab.days[lab.days.length - 1]}. Money: Rs ${st.lump} to start, Rs ${st.monthly} a month. Costs 0.2% each way, ${st.tax === 'none' ? 'no tax' : st.tax + ' tax'}.`,
    `Result: Rs ${Math.round(s.final).toLocaleString('en-US')} from Rs ${Math.round(s.put).toLocaleString('en-US')} put in. ${pc(s.cagr)} a year against ${pc(s.benchCagr)} for the ${benchName} with its dividends.`,
    `Worst fall ${pc(s.maxDrop, 0)} (${lab.days[s.dropFrom]} to ${lab.days[s.dropTo]}); index ${pc(s.benchMaxDrop, 0)}. Months ahead of the index: ${Math.round(s.monthsAhead * 100)}%. Trades: ${r.trades.length}.`,
    `Year by year (strategy / index): ${r.years.map((y) => `${y.year} ${pc(y.ret, 0)} / ${pc(y.bench, 0)}`).join('; ')}.`,
    `Biggest contributors: ${top.join(', ') || 'none'}. Holds now: ${r.holdings.map((h) => h.symbol).join(', ') || 'nothing (cash)'}.`,
    ...r.warnings.map((w) => `Note: ${w}`),
    'Caveats: today’s index lists are used for the whole period and delisted stocks are missing, which flatters results a little; the past is no promise. The user can open this test in the lab from the link under your answer.',
  ].join('\n');
}
