/** Your portfolio as text for the AI: each holding's size, gain, Sahm's view and value figures, plus totals and sectors. */
import type { Row } from '../portfolio/useReviews';

const pc = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;

export const PORTFOLIO_QUESTIONS = [
  "What's the biggest risk in my portfolio?",
  'Which holding should I add to next, and why?',
  'Am I diversified enough?',
  'Which of my holdings look expensive now?',
  'How did my portfolio do in the last month, and why?',
];

export function portfolioContext(rows: Row[], extra: { tracked30?: number | null; index30?: number | null; benchmark?: string } = {}): string {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.holding.shares * r.holding.avgCost, 0);
  const sectors = new Map<string, number>();
  for (const r of rows) sectors.set(r.stock?.sector ?? 'Other', (sectors.get(r.stock?.sector ?? 'Other') ?? 0) + r.value);
  const lines = [
    `MY PORTFOLIO (${rows.length} holdings, value ${rs(total)}, cost ${rs(cost)}, gain ${pc(cost ? total / cost - 1 : null)}).`,
    extra.tracked30 != null ? `Last 30 days: my return ${pc(extra.tracked30)} (money added or taken out removed), ${extra.benchmark ?? 'KSE-100'} ${pc(extra.index30)}.` : '',
    'symbol | weight | gain since bought | today | sector | Sahm says | why | P/E | dividend yield | fair value gap',
    ...[...rows]
      .sort((a, b) => b.value - a.value)
      .map((r) =>
        [
          r.holding.symbol,
          `${(r.weight * 100).toFixed(1)}%`,
          pc(r.review?.pnlPct),
          pc(r.stock?.changePct != null ? r.stock.changePct / 100 : null),
          r.stock?.sector ?? 'n/a',
          r.review ? `${r.review.action}${r.review.watch ? ' (watch)' : ''}` : 'n/a',
          (r.review?.headline ?? '').replace(/\s+/g, ' ').slice(0, 140),
          r.stock?.pe != null ? r.stock.pe.toFixed(1) : 'n/a',
          r.stock?.divYield != null ? `${r.stock.divYield.toFixed(1)}%` : 'n/a',
          pc(r.review?.upside, 0),
        ].join(' | '),
      ),
    `Sectors by weight: ${[...sectors].sort((a, b) => b[1] - a[1]).map(([s, v]) => `${s} ${((v / (total || 1)) * 100).toFixed(0)}%`).join(', ')}.`,
    "Answer about MY holdings using these figures. Be specific (name the stocks and numbers), plain, and say what to check rather than telling me to buy or sell; it's information, not advice.",
  ];
  return lines.filter(Boolean).join('\n');
}
