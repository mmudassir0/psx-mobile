import { parseHoldings, quarterYoY, reviewHolding, ReviewInput } from '../src/portfolio/review';
import { computeSeries } from '../src/analysis/signals';
import type { Candle } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const p = parseHoldings('LUCK 200 419.11\nmari, 60, 643.58\n# comment\n\nMZNPETF\t1,000\t17.79\nbad line');
check('holdings: spaces, commas, tabs, thousands, lower case', p.holdings.length === 3 && p.holdings[1].symbol === 'MARI' && p.holdings[2].shares === 1000 && p.bad.join() === 'bad line', p);

const series = (n: number, f: (i: number) => number): Candle[] => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: i * 864e5, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }; });
const up = computeSeries(series(300, (i) => 100 * Math.exp(0.002 * i)));
const down = computeSeries(series(300, (i) => 200 * Math.exp(-0.002 * i)));
const annual = (a: number, b: number) => ({ periods: ['2026', '2025'], rows: [{ label: 'Profit after Taxation', values: [a, b] }] });
const base: ReviewInput = {
  holding: { symbol: 'X', shares: 100, avgCost: 100 },
  price: 100, weight: 0.08, sector: 'Fertilizer', sectorWeight: 0.1, fund: false,
  series: up, analysis: null,
  company: { pe: 8, financialsAnnual: annual(110, 100), financialsQuarterly: null } as never,
  ratios: null, hasBalanceSheet: false, isBank: false, fair: null, divYield: null,
};
const fairU = { label: 'Undervalued', mid: 140, low: 120, high: 160, methods: [], flags: [], upside: 0.4, epsTtm: 10 } as never;
const fairO = { label: 'Overvalued', mid: 60, low: 50, high: 70, methods: [], flags: [], upside: -0.4, epsTtm: 10 } as never;

check('nothing wrong: hold', reviewHolding(base).action === 'Hold' && !reviewHolding(base).watch);
check('loss-making: review', reviewHolding({ ...base, company: { pe: -3, financialsAnnual: annual(-10, 50) } as never }).action === 'Review');
check('profit down 30%+: review', reviewHolding({ ...base, company: { pe: 9, financialsAnnual: annual(60, 100) } as never }).action === 'Review');
check('profit down 12% alone: hold', reviewHolding({ ...base, company: { pe: 9, financialsAnnual: annual(88, 100) } as never }).action === 'Hold');
check('over 20% of the portfolio: trim', reviewHolding({ ...base, weight: 0.25 }).action === 'Trim');
const weak = reviewHolding({ ...base, series: down });
check('chart broken, business fine: hold and watch, never sell', weak.action === 'Hold' && weak.watch && weak.technicalBreaks.length > 0, weak);
check('weak market wording', /most of the market/.test(reviewHolding({ ...base, series: down, breadth: 0.3 }).headline));
check('undervalued, uptrend, small: add more', reviewHolding({ ...base, fair: fairU }).action === 'Add more');
check('undervalued but downtrend: no adding', reviewHolding({ ...base, fair: fairU, series: down }).action === 'Hold');
check('undervalued but already 12% of portfolio: no adding', reviewHolding({ ...base, fair: fairU, weight: 0.12 }).action === 'Hold');
check('far above fair value alone: a warning, not a trim', reviewHolding({ ...base, fair: fairO }).action === 'Hold');
check('far above fair value with a broken chart, sizeable: trim', reviewHolding({ ...base, fair: fairO, series: down }).action === 'Trim');
check('far above fair value but tiny position: hold', reviewHolding({ ...base, fair: fairO, series: down, weight: 0.01 }).action === 'Hold');
check('buy price never changes the decision', reviewHolding({ ...base, holding: { ...base.holding, avgCost: 300 } }).action === reviewHolding(base).action);
check('funds skip company fundamentals', reviewHolding({ ...base, fund: true, company: null }).action === 'Hold');
const pnl = reviewHolding({ ...base, holding: { symbol: 'X', shares: 10, avgCost: 80 } });
check('profit and loss from the buy price', pnl.pnl === 200 && Math.abs(pnl.pnlPct - 0.25) < 1e-12);
const q = quarterYoY({ financialsQuarterly: { periods: ['Q2 2026', 'Q1 2026', 'Q4 2025', 'Q2 2025'], rows: [{ label: 'EPS', values: [3, 4, 5, 5] }] } } as never);
check('latest quarter against the same quarter a year earlier', !!q && Math.abs(q.change + 0.4) < 1e-12 && q.then === 'Q2 2025', q);

if (failed) {
  console.log(`\n${failed} portfolio check(s) failed`);
  process.exit(1);
}
console.log('\nall portfolio checks passed');
