import { parseHoldings, quarterYoY, reviewHolding, ReviewInput } from '../src/portfolio/review';
import { computeSeries } from '../src/analysis/signals';
import { dataChecks } from '../src/analysis/quality';
import { applyTrade } from '../src/portfolio/holdings';
import { checkHoldings } from '../src/portfolio/screenshot';
import { addEntry, scoreEntry, statsByCall } from '../src/journal/journal';
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

const holdco = dataChecks({ symbol: 'H', sector: 'Inv. Banks / Inv. Cos. / Securities Cos.', company: { financialsAnnual: annual(3, 100) } as never, balance: null, ratios: null });
check('holding company and a 97% profit drop are flagged', holdco.holdingCompany && holdco.profitSwing && holdco.notes.length === 2, holdco.notes);
const rv = reviewHolding({ ...base, sector: 'Inv. Banks / Inv. Cos. / Securities Cos.', company: { pe: 50, financialsAnnual: annual(3, 100) } as never, checks: holdco });
check('a flagged profit drop is a check, not a Review', rv.action === 'Hold' && rv.checks.length === 2 && rv.bad.some((t) => /see the check/.test(t)), rv);
check('an unflagged 40% drop is still a Review', reviewHolding({ ...base, company: { pe: 9, financialsAnnual: annual(60, 100) } as never, checks: dataChecks({ symbol: 'X', company: { financialsAnnual: annual(60, 100) } as never, balance: null, ratios: null }) }).action === 'Review');
const bs = { equity: 40, assets: 200, liabilities: 160, isBank: false, periodEnd: '2026-06-30', source: { pages: [34] } } as never;
const dq = dataChecks({ symbol: 'E', company: null, balance: bs, ratios: { debtToEquity: 2.4, roe: 0.3 } as never, now: Date.UTC(2026, 9, 16) });
check('very high debt is flagged with its page', dq.debtOdd && /240% of equity \(page 34/.test(dq.notes.join(' ')), dq.notes);
check('a commercial bank\'s borrowing is not flagged', !dataChecks({ symbol: 'B', sector: 'Commercial Banks', company: null, balance: bs, ratios: { debtToEquity: 2.6 } as never }).debtOdd);
check('an old balance sheet is flagged', /more than a year old/.test(dataChecks({ symbol: 'E', company: null, balance: bs, ratios: null, now: Date.UTC(2027, 11, 1) }).notes.join(' ')));

const h0 = [{ symbol: 'LUCK', shares: 200, avgCost: 419.11 }];
const b = applyTrade(h0, { symbol: 'luck', side: 'buy', shares: 100, price: 400 });
check('a buy updates the average price', b.holdings[0].shares === 300 && b.holdings[0].avgCost === Math.round(((200 * 419.11 + 100 * 400) / 300) * 100) / 100, b.holdings);
check('a buy of a new stock adds it', applyTrade(h0, { symbol: 'OGDC', side: 'buy', shares: 10, price: 300 }).holdings.length === 2);
const sl = applyTrade(h0, { symbol: 'LUCK', side: 'sell', shares: 50, price: 430 });
check('a sell keeps the average and reports the profit', sl.holdings[0].shares === 150 && sl.holdings[0].avgCost === 419.11 && Math.abs(sl.realised! - 50 * (430 - 419.11)) < 1e-9);
check('selling everything removes the holding', applyTrade(h0, { symbol: 'LUCK', side: 'sell', shares: 200, price: 430 }).holdings.length === 0);
check('cannot sell more than you hold', !!applyTrade(h0, { symbol: 'LUCK', side: 'sell', shares: 201, price: 430 }).error);
check('cannot sell what you do not hold', !!applyTrade(h0, { symbol: 'MARI', side: 'sell', shares: 1, price: 600 }).error);

// The real answer Groq's Qwen gave for the made-up sample screenshot, in a code fence.
const qwen = '```json\n{"holdings":[{"symbol":"OGDC","shares":150,"avgCost":250.00},{"symbol":"MEBL","shares":25,"avgCost":500.00},{"symbol":"TRG","shares":1200,"avgCost":61.25},{"symbol":"PSO","shares":40,"avgCost":380.10}]}\n```';
const ck = checkHoldings(qwen);
check('screenshot answer: parsed through a code fence, sorted', ck.holdings.map((h) => h.symbol).join() === 'MEBL,OGDC,PSO,TRG' && ck.holdings.find((h) => h.symbol === 'PSO')!.avgCost === 380.1, ck);
const bad2 = checkHoldings('{"holdings":[{"symbol":"luck","shares":"1,000","avgCost":"419.11"},{"symbol":"X Y","shares":5,"avgCost":1},{"symbol":"OGDC","shares":2.5,"avgCost":300},{"symbol":"ZZZZ","shares":1,"avgCost":1}]}', (s) => s !== 'ZZZZ');
check('screenshot answer: commas fixed, bad rows rejected with reasons', bad2.holdings.length === 1 && bad2.holdings[0].shares === 1000 && bad2.rejected.length === 3, bad2);
check('screenshot answer with no JSON', checkHoldings('sorry').holdings.length === 0);

// Journal
const e1 = { symbol: 'A', day: '2026-01-05', kind: 'verdict' as const, call: 'Bullish', price: 100 };
let j = addEntry([], e1);
j = addEntry(j, { ...e1, price: 101 });
check('one entry per stock, kind and day', j.length === 1 && j[0].price === 100);
check('a new day adds an entry', addEntry(j, { ...e1, day: '2026-01-06' }).length === 2);
const D = (i: number) => Date.UTC(2026, 0, 5) - 5 * 3600e3 + i * 864e5;
const stockC = Array.from({ length: 80 }, (_, i) => ({ t: D(i), o: 0, h: 0, l: 0, c: 100 * (1 + 0.002 * i), v: 1 }));
const ix = Array.from({ length: 80 }, (_, i) => ({ t: D(i), v: 1000 * (1 + 0.001 * i), vol: 0 }));
const sc = scoreEntry(e1, stockC, ix);
check('scored from the entry day close after 21 and 63 days, against the index', Math.abs(sc.ret[21]! - 0.042) < 1e-9 && Math.abs(sc.rel[21]! - (0.042 - 0.021)) < 1e-9 && sc.ret[63] != null, sc);
check('too recent to score: nothing', Object.keys(scoreEntry({ ...e1, day: '2026-03-20' }, stockC, ix).ret).length === 0);
const st = statsByCall([sc, scoreEntry({ ...e1, symbol: 'B', call: 'Bearish' }, stockC, ix)], 21);
check('stats: Bullish that beat the index is right, Bearish that beat it is wrong', st.find((x) => x.call === 'Bullish')!.right === 1 && st.find((x) => x.call === 'Bearish')!.right === 0, st);

if (failed) {
  console.log(`\n${failed} portfolio check(s) failed`);
  process.exit(1);
}
console.log('\nall portfolio checks passed');
