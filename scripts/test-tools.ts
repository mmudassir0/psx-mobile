/** Tests for the tools: compare, dividend income plan, rebalance, what-if. Run with `npx tsx scripts/test-tools.ts`. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { peBand, profitsFrom } from '../src/analysis/peBand';
import { portion, sellPlan } from '../src/portfolio/sellPlan';
import { overLimit, sectorShares, setLimit } from '../src/portfolio/sectorLimits';
import { growthSources } from '../src/portfolio/growthSources';
import { morningLines, morningText, nextTradingDays } from '../src/portfolio/morningBrief';
import { parseQuery, searchJournal } from '../src/portfolio/journal';
import { pickExample, TERMS } from '../src/analysis/glossary';
import { dividendsReceived, setRate, shariahSummary } from '../src/portfolio/shariah';
import { deleteScreen, markSeen, newSince, sameSettings, saveScreen, suggestName } from '../src/analysis/savedScreens';
import { move, orderOf, toggle, visibleCards } from '../src/nav/homeCards';
import { cpiFromNews, marketYields, parsePbsInflation, parseSbp, petrolFromNews } from '../src/analysis/macro';
import { buildTimeline } from '../src/portfolio/timeline';
import { position, stateOf, withTargetRules } from '../src/portfolio/targets';
import { colName, toBase64, xlsx } from '../src/xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { inbox, kindOf } from '../src/analysis/announcements';
import { addGroup, deleteGroup, groupsOf, renameGroup, toggleInGroup } from '../src/portfolio/watchGroups';
import { goalsFrom, goalsStatus } from '../src/portfolio/goal';
import { nextResults, resultsShort } from '../src/analysis/results';
import { normalVolume, volumeSpike } from '../src/analysis/activity';
import { nested, squarify } from '../src/analysis/treemap';
import { sharesFromTrades, snapshotLookup, statementHtml, taxStatement } from '../src/portfolio/taxStatement';
import { crossedToday, describeRule, parseRules, rulesText } from '../src/analysis/watch';
import { nextPlanDays, planDayIn, planDue } from '../src/portfolio/planDates';
import { dueNotes, inMonths, moved } from '../src/portfolio/noteDates';
import { breakEven, tradeCost } from '../src/portfolio/costs';
import { moneyWeightedRate, whatIf } from '../src/analysis/whatif';
import { normalise, rebalance } from '../src/portfolio/rebalance';
import { incomeIdeas, incomePlan, nextMonths } from '../src/portfolio/income';
import { changeOver, compareRows, maxDrawdown, rebased } from '../src/analysis/compare';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && !ok ? '  ' + JSON.stringify(detail).slice(0, 600) : ''}`);
}

// compare stocks
check('change over n sessions', Math.abs(changeOver([100, 110, 121], 2)! - 21) < 1e-9 && changeOver([1], 5) === null);
check('worst fall from a high', Math.abs(maxDrawdown([...Array(10).fill(100), 120, 90, 100, ...Array(10).fill(100)])! - -25) < 1e-9);
const rb = rebased([[{ t: 0, c: 10 }, { t: 864e5, c: 11 }, { t: 2 * 864e5, c: 12 }], [{ t: 864e5, c: 50 }, { t: 2 * 864e5, c: 25 }]]);
check('rebased to 100 from the first shared day', rb.length === 2 && rb[0].v[0] === 100 && rb[0].v[1] === 100 && Math.abs(rb[1].v[0] - 109.0909) < 1e-3 && rb[1].v[1] === 50, rb);
const mk = (sym: string, pe: number, dy: number) => ({ pack: { stock: { symbol: sym, name: sym, sector: 'Cement', price: 100, change: 0, changePct: 0, ldcp: 100, volume: 1, shariah: true, indexes: ['KSE100'], marketCap: 1e10, pe, divYield: dy, change1y: 0, bid: null, bidVol: null, ask: null, askVol: null }, company: null, analysis: null, tech: null, ratios: null, balance: null, peers: [], today: '2026-10-26' }, closes: Array.from({ length: 300 }, (_, i) => 100 + i * (sym === 'A' ? 0.1 : -0.1)) });
const cr = compareRows([mk('A', 8, 5), mk('B', 12, 5)]);
const row = (l: string) => cr.find((r) => r.label === l)!;
check('compare: lower P/E wins, equal yields have no star, 1-year leader marked', row('P/E').best.join() === '0' && row('Dividend yield').best.length === 0 && row('1 year').best.join() === '0' && row('Price').best.length === 0, cr.map((r) => [r.label, r.values, r.best]));

// --- end compare

// dividend income plan
{
  const now = Date.parse('2026-10-26T07:00:00Z');
  const D = 864e5;
  const div = (list: { announced: number; dps: number; bookClosure: number | null }[], cut: string | null = null) => ({
    faceValue: 10, ttm: 0, ttmYield: null, years: [], cut, lower: null,
    list: list.map((p) => ({ ...p, period: null, periodType: null, bonusPct: 0 })),
  });
  check('months from now to a year on', nextMonths(now).join() === '2026-10,2026-11,2026-12,2027-01,2027-02,2027-03,2027-04,2027-05,2027-06,2027-07,2027-08,2027-09,2027-10', nextMonths(now));
  {
    // an annual payer whose book closure was 5 weeks ago: next year's lands just inside the 365 days
    const p = incomePlan([{ symbol: 'LUCK', shares: 10, sector: 'Cement', dividends: div([{ announced: now - 77 * D, dps: 25, bookClosure: now - 38 * D }]) }], 'filer', now);
    check('annual payer near the year end still counted', p.items.length === 1 && p.items[0].month === '2027-10', p.items);
  }
  const plan = incomePlan(
    [
      // announced: book closure in 10 days, Rs 5; and last year's final in Feb (Rs 8) repeats
      { symbol: 'AAA', shares: 100, sector: 'Cement', dividends: div([{ announced: now - 5 * D, dps: 5, bookClosure: now + 10 * D }, { announced: now - 250 * D, dps: 8, bookClosure: now - 230 * D }]) },
      // last year's interim a year ago (10 days before now): already announced again this year → not doubled
      { symbol: 'BBB', shares: 10, sector: 'Power Generation & Distribution', dividends: div([{ announced: now - 20 * D, dps: 4, bookClosure: now + 3 * D }, { announced: now - 360 * D, dps: 4, bookClosure: now - 345 * D }]) },
      { symbol: 'CUT', shares: 50, sector: 'Cement', dividends: div([{ announced: now - 100 * D, dps: 2, bookClosure: now - 80 * D }], 'Dividend cut') },
      { symbol: 'NIL', shares: 50, sector: 'Cement', dividends: div([{ announced: now - 500 * D, dps: 2, bookClosure: now - 480 * D }]) },
    ],
    'filer',
    now,
  );
  const sym = (s: string) => plan.items.filter((i) => i.symbol === s);
  check('announced dividend counted once, paid two weeks after book closure', sym('AAA').filter((i) => i.known).length === 1 && sym('AAA').find((i) => i.known)!.month === '2026-11');
  check("last year's dividend expected again a year on", sym('AAA').some((i) => !i.known && i.dps === 8 && i.month === '2027-03'), sym('AAA'));
  check('same dividend already announced this year is not counted twice', sym('BBB').length === 1 && sym('BBB')[0].known, sym('BBB'));
  check('power producer taxed at 7.5%, others 15% (filer)', Math.abs(sym('BBB')[0].net - 40 * 0.925) < 1e-9 && Math.abs(sym('AAA')[0].net - 500 * 0.85) < 1e-9);
  check('cut and non-payers listed, not estimated', plan.cut.join() === 'CUT' && plan.none.join() === 'NIL' && !sym('CUT').length && !sym('NIL').length);
  check('totals add up', Math.abs(plan.net - plan.months.reduce((a, m) => a + m.net, 0)) < 1e-9 && plan.months.length === 13);
  const ideas = incomeIdeas(
    [
      { symbol: 'A', divYield: 12, indexes: ['KSE100'], price: 10 },
      { symbol: 'B', divYield: 25, indexes: ['KSE100'], price: 10 },
      { symbol: 'C', divYield: 9, indexes: ['KMI30'], price: 10 },
      { symbol: 'D', divYield: 7, indexes: [], price: 10 },
      { symbol: 'E', divYield: 11, indexes: ['KSE100'], price: 10 },
    ],
    new Set(['E']),
    false,
  );
  check('income ideas: index members, 5-18% yield, not owned, highest first', ideas.map((s) => s.symbol).join() === 'A,C', ideas);
  check('income ideas: Shariah keeps KMI-30 only', incomeIdeas([{ symbol: 'A', divYield: 12, indexes: ['KSE100'], price: 10 }, { symbol: 'C', divYield: 9, indexes: ['KMI30'], price: 10 }], new Set(), true).map((s) => s.symbol).join() === 'C');
}

// rebalance
{
  check('targets scale to 100%', JSON.stringify(normalise({ A: 30, B: 30 }, ['A', 'B', 'C'])) === JSON.stringify({ A: 0.5, B: 0.5, C: 0 }));
  const pos = [
    { symbol: 'A', shares: 100, price: 100 }, // 10,000
    { symbol: 'B', shares: 100, price: 50 }, // 5,000
    { symbol: 'C', shares: 0, price: 25 }, // new
  ];
  const r1 = rebalance(pos, { A: 1, B: 1, C: 1 }, 15000, false);
  const t = (r: typeof r1, s: string) => r.trades.find((x) => x.symbol === s)?.shares ?? 0;
  check('new money only: never sells, fills the gaps', r1.trades.every((x) => x.shares > 0) && t(r1, 'A') === 0 && t(r1, 'B') === 100 && t(r1, 'C') === 400 && r1.leftover < 100, r1);
  const r2 = rebalance(pos, { A: 1, B: 1, C: 1 }, 0, true);
  check('buy and sell: trims the overweight, buys the rest, weights close to target', t(r2, 'A') === -50 && t(r2, 'B') === 0 && t(r2, 'C') === 200 && r2.maxGap < 1.5 && r2.trades[0].shares < 0, r2);
  const r3 = rebalance(pos, { A: 1, B: 1, C: 1 }, 1000, false);
  check('too little cash: spread over the gaps, within the cash', r3.trades.reduce((a, x) => a + x.value, 0) <= 1000 + 1e-9 && t(r3, 'C') > 0 && r3.leftover >= 0 && r3.leftover < 50, r3);
  const r4 = rebalance([{ symbol: 'A', shares: 10, price: 100 }, { symbol: 'B', shares: 10, price: 100 }], { A: 50, B: 50 }, 0, true);
  check('already on target: nothing to do', r4.trades.length === 0 && r4.maxGap < 1e-9);
}

// what-if
{
  const D = 864e5;
  const t0 = Date.UTC(2023, 0, 2, 5);
  // a price that doubles in a straight line over ~3 years of weekdays
  const days: number[] = [];
  for (let t = t0; days.length < 780; t += D) if (![0, 6].includes(new Date(t).getUTCDay())) days.push(t);
  const candles = days.map((t, i) => ({ t, o: 0, h: 0, l: 0, c: 100 * (1 + i / 779), v: 1 }));
  const r = whatIf({ candles, start: t0, amount: 100000, monthly: 0, taxRate: 0.15 })!;
  check('single buy: doubles with the price', Math.abs(r.value - 200000) < 1 && r.buys === 1 && Math.abs(r.totalReturn - 1) < 1e-6, r.value);
  check('yearly rate for a double in ~3 years is about 26%', r.yearly != null && r.yearly > 0.24 && r.yearly < 0.28, r.yearly);
  check('money-weighted rate: 100 → 110 in a year is 10%', Math.abs(moneyWeightedRate([{ t: 0, amount: 100 }], 110, 365.25 * D)! - 0.1) < 1e-6);
  const m = whatIf({ candles, start: t0, amount: 10000, monthly: 10000, taxRate: 0.15 })!;
  check('monthly: one buy a month', m.buys >= 35 && m.buys <= 37 && Math.abs(m.invested - m.buys * 10000) < 1e-6, m.buys);
  // a dividend of Rs 10 a share a year in, then a 100% bonus later: paid on half of today's shares
  const div = [
    { dps: 10, bonusPct: 0, bookClosure: days[260] },
    { dps: 0, bonusPct: 100, bookClosure: days[520] },
  ];
  const d = whatIf({ candles, dividends: div, start: t0, amount: 100000, monthly: 0, taxRate: 0.15 })!;
  // 1,000 shares in today's terms, but only 500 when the dividend was paid
  check('dividend counted on the shares held then (bonus since), after tax', Math.abs(d.dividendsGross - 5000) < 1e-6 && Math.abs(d.dividendsNet - 4250) < 1e-6, d.dividendsGross);
  const dip = candles.map((b, i) => ({ ...b, c: i === 100 ? 60 : b.c }));
  const w = whatIf({ candles: dip, start: t0, amount: 100000, monthly: 0, taxRate: 0 })!;
  check('worst fall below the money put in', w.worst != null && Math.abs(w.worst.pct - -0.4) < 1e-9 && w.worst.t === days[100], w.worst);
  check('no history from the start date: no answer', whatIf({ candles, start: days[779] + 5 * D, amount: 1, monthly: 0, taxRate: 0 }) === null);
}

// trade costs
{
  const c = tradeCost(1000, 100); // Rs 100,000
  // brokerage 150, sales tax 16% of (150 + 3.50) = 24.56, PSX 3.50 + 0.62, SECP 0.65, NCCPL 1.11, CDC 3.60 → min 5
  check('costs on a Rs 100,000 trade', Math.abs(c.brokerage - 150) < 1e-9 && Math.abs(c.salesTax - 24.56) < 1e-9 && Math.abs(c.exchange - (3.5 + 0.62 + 0.65 + 1.11 + 5)) < 1e-9 && Math.abs(c.pct - 0.0018544) < 1e-6, c);
  const cheap = tradeCost(10000, 5); // under Rs 20: Rs 0.03 a share beats 0.15%
  check('minimum brokerage per share under Rs 20', Math.abs(cheap.brokerage - 300) < 1e-9, cheap.brokerage);
  const be = breakEven(1000, 100);
  check('break-even is about 0.37% above the buy price', be > 100.36 && be < 100.39, be);
  const after = 1000 * be - tradeCost(1000, be).total;
  check('selling at break-even gets back what was paid', after >= 100000 + c.total - 1e-6 && after - (100000 + c.total) < 15, after - (100000 + c.total));
}

// notes
{
  const now = Date.parse('2026-10-26T20:30:00Z'); // 27 Oct 01:30 in Pakistan
  check('review date months ahead, in Pakistan time', inMonths(6, now) === '2027-04-27' && inMonths(3, now) === '2027-01-27', inMonths(6, now));
  check('due notes: on or before today, oldest first', dueNotes({ A: { checkOn: '2026-10-27' }, B: { checkOn: '2026-09-01' }, C: { checkOn: '2026-10-28' }, D: { checkOn: null } }, now).join() === 'B,A');
  check('then → now', moved(12, 7.1, (v) => `${v.toFixed(1)}%`) === '12.0% → 7.1%' && moved(null, 3, String) === null);
}

// monthly plan
{
  check('plan day on a weekend moves to Monday', planDayIn(2026, 11, 5) === '2026-12-07'); // 5 Dec 2026 is a Saturday
  check('plan day on a PSX holiday moves on', planDayIn(2026, 10, 9) === '2026-11-10'); // Iqbal Day
  const now = Date.parse('2026-10-26T07:00:00Z');
  check('next plan days from today', nextPlanDays(5, now).join() === '2026-11-05,2026-12-07,2027-01-05', nextPlanDays(5, now));
  const plan = { on: true, amount: 20000, day: 5, doneMonth: null as string | null };
  check('due after the day until marked done', planDue(plan, now) && !planDue({ ...plan, doneMonth: '2026-10' }, now) && !planDue({ ...plan, on: false }, now) && !planDue({ ...plan, day: 28 }, now));
}

// buy-zone alerts
{
  const { rules, bad } = parseRules('MEBL yield>9, LUCK<fair, HUBC >fair, SYS<100, PPL<200d, X yield<200d, OGDC yield > 12.5%');
  check('parse yield and fair rules', rules.length === 6 && bad.join() === 'X yield<200d' && rules[0].yield === true && rules[0].level === 9 && rules[1].level === 'fair' && rules[2].dir === '>' && rules[5].level === 12.5 && rules[5].symbol === 'OGDC', rules);
  check('rules round-trip as text', rulesText(rules) === 'MEBL yield>9, LUCK<fair, HUBC>fair, SYS<100, PPL<200d, OGDC yield>12.5', rulesText(rules));
  check('described in words', describeRule(rules[0]) === "MEBL's dividend yield goes above 9%" && describeRule(rules[1]) === "LUCK closes below Sahm's fair value range");
  // Rs 30 a year in dividends: 9% at Rs 333; the close falls from 340 to 330
  check('yield crosses 9% as the price falls', crossedToday(rules[0], [350, 340, 330], { ttmDps: 30 }) && !crossedToday(rules[0], [350, 330, 320], { ttmDps: 30 }));
  check('below the fair value range', crossedToday(rules[1], [105, 101, 99], { fair: { low: 100, high: 140 } }) && !crossedToday(rules[1], [105, 101, 99], {}));
  check('above the fair value range', crossedToday(rules[2], [130, 139, 141], { fair: { low: 100, high: 140 } }));
}

// tax statement
{
  const trades = [
    { day: '2025-08-01', symbol: 'AAA', side: 'buy' as const, shares: 100, price: 50, avgCost: 50, realised: null },
    { day: '2025-12-10', symbol: 'AAA', side: 'sell' as const, shares: 40, price: 80, avgCost: 50, realised: 1200 },
    { day: '2026-02-01', symbol: 'BBB', side: 'sell' as const, shares: 10, price: 40, avgCost: 60, realised: -200 },
    { day: '2026-08-01', symbol: 'AAA', side: 'sell' as const, shares: 10, price: 90, avgCost: 50, realised: 400 }, // next tax year
  ];
  check('shares at a date, walked back from today through the trades', sharesFromTrades(trades, 'AAA', '2025-11-30', 50) === 100 && sharesFromTrades(trades, 'AAA', '2026-01-01', 50) === 60 && sharesFromTrades(trades, 'ZZZ', '2026-01-01', 5) === null);
  const bc = (d: string) => Date.parse(d + 'T00:00:00+05:00');
  const div = (list: { dps: number; bookClosure: number }[]) => ({ faceValue: 10, ttm: 0, ttmYield: null, years: [], cut: null, lower: null, list: list.map((p) => ({ ...p, announced: p.bookClosure - 20 * 864e5, period: null, periodType: null, bonusPct: 0 })) });
  const st = taxStatement({
    year: 2026,
    trades,
    status: 'filer',
    bought: {},
    holdings: [
      { symbol: 'AAA', shares: 50, sector: 'Cement', dividends: div([{ dps: 5, bookClosure: bc('2025-10-15') }, { dps: 3, bookClosure: bc('2026-03-01') }, { dps: 9, bookClosure: bc('2026-09-01') }]) },
      { symbol: 'CCC', shares: 20, sector: 'Power Generation & Distribution', dividends: div([{ dps: 2, bookClosure: bc('2026-04-10') }]) },
    ],
    snapshotShares: snapshotLookup([{ day: '2026-04-01', pos: { CCC: [30, 0, 0] } }]),
  });
  check('sales in the tax year only, losses set off before tax', st.sales.length === 2 && st.gains === 1200 && st.losses === 200 && st.net === 1000 && Math.abs(st.cgt - 150) < 1e-9, st);
  check('dividends on the shares held at book closure', st.dividends.length === 3 && st.dividends[0].shares === 100 && st.dividends[1].shares === 60 && st.dividends[2].symbol === 'CCC' && st.dividends[2].shares === 30, st.dividends);
  check('tax withheld by payer (power 7.5%)', Math.abs(st.divWithheld - (500 * 0.15 + 180 * 0.15 + 60 * 0.075)) < 1e-9 && st.assumed.length === 0, st.divWithheld);
  const html = statementHtml(st, { name: 'M & co', status: 'filer', made: '27 Oct 2026' });
  check('statement page has the totals and escapes text', html.includes('tax year 2026') && html.includes('Rs 1,000') && html.includes('M &amp; co') && !html.includes('M & co'));
}

// treemap
{
  const vals = [6, 6, 4, 3, 2, 2, 1];
  const t = squarify(vals, (v) => v, { x: 0, y: 0, w: 6, h: 4 });
  const area = (r: { w: number; h: number }) => r.w * r.h;
  check('treemap: areas in proportion, inside the box', t.length === 7 && t.every((r) => Math.abs(area(r) - r.item) < 1e-9 && r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 6 + 1e-9 && r.y + r.h <= 4 + 1e-9), t);
  const overlap = t.some((a, i) => t.some((b, j) => i < j && a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9));
  check('treemap: no overlaps', !overlap);
  check('treemap: tiles are not slivers', t.every((r) => Math.max(r.w / r.h, r.h / r.w) < 4), t.map((r) => (r.w / r.h).toFixed(2)));
  const n = nested([{ s: 'A', v: 3 }, { s: 'A', v: 1 }, { s: 'B', v: 4 }, { s: 'C', v: 0 }], (x) => x.s, (x) => x.v, { x: 0, y: 0, w: 100, h: 100 }, 10);
  check('nested: groups sized by their totals, empty items left out', n.length === 2 && Math.abs(area(n[0].rect) - 5000) < 1e-6 && n.reduce((a, g) => a + g.tiles.length, 0) === 3);
}

// results season and unusual activity
{
  const ann = (date: string, title: string) => ({ date, title, url: null, category: 'Financial Results' });
  const company = {
    fiscalYearEnd: 'June',
    announcements: [
      ann('2025-10-24', 'Financial Results for the Quarter Ended - September 30, 2025'),
      ann('2026-02-20', 'Financial Results for the Half Year Ended - December 31, 2025'),
      ann('2026-04-22', 'Financial Results for the Quarter Ended - March 31, 2026'),
      ann('2026-09-15', 'Financial Results for the Year Ended - June 30, 2026'),
    ],
    financialsQuarterly: { periods: ['Q4 2026', 'Q3 2026', 'Q2 2026', 'Q1 2026'], rows: [{ label: 'EPS', values: [5, 4, 3, 2.5] }, { label: 'Profit after Taxation', values: [500, 400, 300, 250] }] },
    financialsAnnual: null,
  } as never;
  const n = nextResults(company, Date.parse('2026-10-27T07:00:00Z'))!;
  check('next results: the September quarter, Q1 of the June year', n.label === 'Q1 2027' && n.periodEnd === '2026-09-30' && n.kind === 'quarter', n);
  check('expected a year after last year’s, with the 30-day deadline', n.expected === '2026-10-24' && n.basis === 'last year' && n.deadline === '2026-10-30', n);
  check("last year's same quarter from PSX's table", n.lastYear?.label === 'Q1 2026' && n.lastYear.eps === 2.5 && n.lastYear.profit === 250, n.lastYear);
  check('short results line', resultsShort({ eps: 3, epsBefore: 2.5, epsChange: 0.2, tableBehind: false } as never) === 'results out: EPS +20% on last year');
  const vols = [...Array(20).fill(100_000), 350_000];
  check('normal volume is the median of the 20 sessions before', normalVolume(vols) === 100_000);
  check('3.5× normal volume is unusual; small volumes are not', volumeSpike(vols) === 3.5 && volumeSpike([...Array(20).fill(5_000), 40_000]) === null && volumeSpike([...Array(20).fill(100_000), 200_000]) === null);
}

// several goals
{
  const now = Date.parse('2026-10-27T07:00:00Z');
  const migrated = goalsFrom(null, { target: 2e6, by: '2031-12', rate: 0.15 }, 20000);
  check('the old single goal becomes the first of the list', migrated.length === 1 && migrated[0].name === 'My goal' && migrated[0].share === 1 && migrated[0].monthly === 20000);
  check('no goals before: empty list; a saved list wins', goalsFrom(null, null, null).length === 0 && goalsFrom([], { target: 1, by: '2030-12', rate: 0.1 }, null).length === 0);
  const gs = goalsStatus(
    [
      { id: 'a', name: 'House', target: 5e6, by: '2032-12', rate: 0.12, share: 0.8, monthly: 30000 },
      { id: 'b', name: 'Hajj', target: 2e6, by: '2028-12', rate: 0.1, share: 0.4, monthly: 0 },
    ],
    1e6,
    now,
  );
  check('shares over 100% are scaled down', Math.abs(gs[0].value - 666666.67) < 1 && Math.abs(gs[1].value - 333333.33) < 1, gs.map((g) => g.value));
  check('each goal gets its own monthly need and course check', gs[0].status.reach != null && gs[1].status.reach === null && gs[1].status.need > 0);
}

// watchlist groups
{
  let g = addGroup([], 'Banks to buy', 1);
  g = addGroup(g, ' banks to BUY ', 2); // same name: not added twice
  g = addGroup(g, 'Dividend payers', 3);
  check('groups: added once each', g.length === 2 && g[0].name === 'Banks to buy');
  g = toggleInGroup(g, g[0].id, 'MEBL');
  g = toggleInGroup(g, g[1].id, 'MEBL');
  g = toggleInGroup(g, g[0].id, 'UBL');
  check('a stock can be in several lists', groupsOf(g, 'MEBL').length === 2 && g[0].symbols.join() === 'MEBL,UBL');
  g = toggleInGroup(g, g[0].id, 'MEBL');
  check('tapping again removes it', g[0].symbols.join() === 'UBL');
  check('rename and delete', renameGroup(g, g[1].id, 'Income')[1].name === 'Income' && deleteGroup(g, g[0].id).length === 1);
}

// announcements inbox
{
  const a = (date: string, title: string, category = 'Others') => ({ date, title, url: null, category });
  check('announcement kinds', kindOf(a('', 'Financial Results for the Quarter Ended', 'Financial Results')) === 'results' && kindOf(a('', 'Credit of final cash dividend')) === 'payout' && kindOf(a('', 'Material Information')) === 'material' && kindOf(a('', 'Disclosure of Interest by a Director CEO u/c 5.6.1.(d)')) === 'insider' && kindOf(a('', 'Board Meeting', 'Board Meetings')) === 'meeting');
  const now = Date.parse('2026-10-27T07:00:00Z');
  const items = inbox({ LUCK: [a('2026-10-26', 'Material Information'), a('2026-10-20', 'Board Meeting', 'Board Meetings'), a('2026-07-01', 'Old')], MEBL: [a('2026-10-26', 'Credit of final cash dividend')] }, Date.parse('2026-10-21T07:00:00Z'), now);
  check('inbox: last 60 days, newest first, new since last look', items.length === 3 && items[0].symbol === 'LUCK' && items[1].symbol === 'MEBL' && items[0].fresh && !items[2].fresh, items);
  check('nothing is "new" the first time', inbox({ X: [a('2026-10-26', 'x')] }, 0, now)[0].fresh === false);
}

// excel
{
  check('column names', colName(0) === 'A' && colName(25) === 'Z' && colName(26) === 'AA' && colName(701) === 'ZZ');
  check('base64', toBase64(new Uint8Array([77, 97, 110])) === 'TWFu' && toBase64(new Uint8Array([77])) === 'TQ==');
  const z = unzipSync(xlsx([{ name: 'A/B', rows: [['h', 'n'], ['x & <y>', 1.5]] }, { name: 'A/B', rows: [] }]));
  const wb = strFromU8(z['xl/workbook.xml']);
  const sh = strFromU8(z['xl/worksheets/sheet1.xml']);
  check('workbook: safe unique sheet names, escaped text, numbers as numbers', wb.includes('name="A B"') && wb.includes('name="A B 2"') && sh.includes('x &amp; &lt;y&gt;') && sh.includes('<v>1.5</v>') && !!z['xl/styles.xml'], wb);
}

// targets per holding
{
  const t = { target: 500, rethink: 300 };
  check('position between rethink and target', position(400, t) === 0.5 && position(250, t)! < 0 && position(550, t)! > 1 && position(400, { target: 300, rethink: 500 }) === null);
  check('reached, broken, between', stateOf(500, t) === 'reached' && stateOf(299, t) === 'broken' && stateOf(400, t) === 'between' && stateOf(400, undefined) === null);
  const rules = [{ symbol: 'LUCK', dir: '>' as const, level: 450 }, { symbol: 'LUCK', dir: '<' as const, level: 'ma200' as const }, { symbol: 'MEBL', dir: '>' as const, level: 450 }];
  const r1 = withTargetRules(rules, 'LUCK', { target: 450, rethink: null }, { target: 500, rethink: 300 });
  check('alert rules follow the targets: old one swapped, others kept', r1.length === 4 && !r1.some((r) => r.symbol === 'LUCK' && r.level === 450) && r1.some((r) => r.symbol === 'LUCK' && r.level === 500 && r.dir === '>') && r1.some((r) => r.symbol === 'LUCK' && r.level === 300 && r.dir === '<') && r1.some((r) => r.symbol === 'MEBL'), r1);
  check('clearing targets removes their alerts', withTargetRules(r1, 'LUCK', { target: 500, rethink: 300 }, { target: null, rethink: null }).filter((r) => r.symbol === 'LUCK').length === 1);
}

// timeline
{
  const D = 864e5;
  const now = Date.parse('2026-10-27T07:00:00Z');
  const snap = (day: string, value: number, shares: number, price: number) => ({ day, value, pos: { AAA: [shares, shares * 100, price] as [number, number, number] }, div: 0 });
  const ev = buildTimeline({
    trades: [{ day: '2026-10-01', symbol: 'AAA', side: 'buy', shares: 100, price: 100, avgCost: 100, realised: null }, { day: '2026-10-20', symbol: 'AAA', side: 'sell', shares: 20, price: 120, avgCost: 100, realised: 400 }],
    holdings: [{ symbol: 'AAA', shares: 80, dividends: { faceValue: 10, ttm: 0, ttmYield: null, years: [], cut: null, lower: null, list: [{ announced: now - 30 * D, period: null, periodType: null, dps: 5, bonusPct: 0, bookClosure: Date.parse('2026-10-15T00:00:00+05:00') }, { announced: now - 400 * D, period: null, periodType: null, dps: 3, bonusPct: 0, bookClosure: now - 380 * D }] }, announcements: [{ date: '2026-10-22', title: 'Financial Results for the Quarter Ended September 30, 2026', url: null, category: 'Financial Results' }] }],
    notes: { AAA: { why: 'cheap', at: Date.parse('2026-10-02T07:00:00Z') } },
    snaps: [snap('2026-10-01', 10000, 100, 100), snap('2026-10-02', 10500, 100, 105), snap('2026-10-03', 10400, 100, 104)],
    sharesOn: (_s, day) => (day < '2026-10-20' ? 100 : 80),
    now,
  });
  const kinds = ev.map((e) => e.kind).join();
  check('timeline: newest first with every kind', kinds === 'results,sell,dividend,bigday,note,buy,start', kinds);
  check('dividend on the shares held then; old payouts before tracking left out', ev.find((e) => e.kind === 'dividend')!.sub!.includes('Rs 500') && ev.filter((e) => e.kind === 'dividend').length === 1);
  check('a 5% day is a big day; 1% is not', ev.filter((e) => e.kind === 'bigday').length === 1 && ev.find((e) => e.kind === 'bigday')!.tone === 1);
}

// economy
{
  const sbp = parseSbp(readFileSync(join(__dirname, 'fixtures', 'sbp_home.txt'), 'utf8'));
  check('SBP: policy rate and latest decision', sbp.policy === 12 && sbp.mpc === 'increase the policy rate by 50 bps to 12% w.e.f. October 27, 2026', sbp);
  check('SBP: KIBOR mid rates', sbp.kibor.m3 === 11.91 && sbp.kibor.m6 === 12.33 && sbp.kibor.m12 === 12.54, sbp.kibor);
  check('SBP: T-bill and PIB cut-offs with dates', sbp.tbills.m3 === 11.9999 && sbp.tbills.m12 === 12.4999 && sbp.tbills.asOf === 'Oct 14, 2026' && sbp.pibs.y10 === 12.5 && sbp.pibs.y5 === 12.49, [sbp.tbills, sbp.pibs]);
  check('SBP: dollar rate and reserves', sbp.usd === 276.8118 && sbp.reserves.total === 26833 && sbp.reserves.sbp === 21488.6, [sbp.usd, sbp.reserves]);
  const inf = parsePbsInflation(readFileSync(join(__dirname, 'fixtures', 'pbs_inflation_chart.txt'), 'utf8'));
  check('PBS inflation: every month from the chart, newest last', inf.length === 33 && inf[0][0] === '2024-01' && inf[0][1] === 28.3 && inf[32][0] === '2026-09' && inf[32][1] === 10.3 && inf[32][2] === 1.3 && inf[26][0] === '2026-03', [inf[0], inf[26], inf[32]]);
  check('petrol price from the news', petrolFromNews('Following the revision, the price of HSD was increased from Rs393.66 to Rs395.82 per litre, while petrol price went up from Rs377.71 to Rs379.25 per litre.') === 379.25);
  check('inflation from the news', cpiFromNews('Pakistan’s CPI inflation clocked in at 5.6% in September, PBS data showed')?.cpi === 5.6 && cpiFromNews('Inflation eases to 4.2pc in August')?.month === 'August');
  const y = marketYields([{ indexes: ['KSE100'], marketCap: 100, pe: 5, divYield: 10 }, { indexes: ['KSE100'], marketCap: 100, pe: 10, divYield: 4 }, { indexes: ['KSE100'], marketCap: 50, pe: null, divYield: null }]);
  check('market earnings and dividend yield, weighted by value', Math.abs(y.pe! - 200 / 30) < 1e-9 && Math.abs(y.earningsYield! - 15) < 1e-9 && Math.abs(y.dividendYield! - 5.6) < 1e-9, y);
}

// home cards
{
  const l = { order: ['news', 'mood'] as never[], hidden: ['mood'] as never[] };
  const o = orderOf(l);
  check('saved order kept, missing cards put back in their default place', o.indexOf('news' as never) < o.indexOf('mood' as never) && o[0] === 'indices' && o.length === 9, o);
  check('hidden cards left out', !visibleCards(l).includes('mood' as never) && visibleCards(l).length === 8);
  const full = { order: orderOf(l), hidden: [] as never[] };
  const m = move(full, 'mood' as never, -1);
  check('move up and toggle', orderOf(m).indexOf('mood' as never) === o.indexOf('mood' as never) - 1 && !toggle(l, 'mood' as never).hidden.length && move(full, 'indices' as never, -1) === full);
}

// P/E against its own history
{
  const D = 864e5;
  const t0 = Date.UTC(2023, 0, 2);
  // 1,000 shares; profit Rs 10,000 for FY2023 (June year), Rs 20,000 for FY2024; price 100 flat then 150
  const candles = Array.from({ length: 900 }, (_, i) => ({ t: t0 + i * D, o: 0, h: 0, l: 0, c: i < 700 ? 100 : 150, v: 1 }));
  const b = peBand({ candles, profits: [{ fy: '2023', profit: 10_000 }, { fy: '2024', profit: 20_000 }], fyEndMonth: 5, shares: 1000 })!;
  check('P/E from market value and the profit known then', Math.abs(b.points[0].pe - 10) < 1e-9 && b.points[0].t >= Date.UTC(2023, 9, 1), b.points[0]);
  check('the newer year counts from three months after its end', b.points.some((p) => p.t >= Date.UTC(2024, 9, 1) && Math.abs(p.pe - 5) < 1e-9 && p.t < t0 + 700 * D));
  check('today and where it sits', Math.abs(b.now - 7.5) < 1e-9 && b.min === 5 && b.max === 10 && b.cheaperThan > 0.3 && b.cheaperThan < 0.7, b);
  check('profits from the PSX table (thousands → rupees), losses left out', profitsFrom({ periods: ['2026', '2025'], rows: [{ label: 'Profit after Taxation', values: [46629367, -5] }] }).length === 1 && profitsFrom({ periods: ['2026'], rows: [{ label: 'Profit after Taxation', values: [46629367] }] })[0].profit === 46629367000);
}

// Sell planner
{
  const base = { shares: 100, price: 200, avgCost: 150, status: 'filer' as const, divRate: 0.15 };
  const p = sellPlan(base)!;
  check('sell now: proceeds less charges and 15% tax on the gain', Math.abs(p.now.tax - 750) < 1e-6 && p.now.costs > 0 && Math.abs(p.now.inHand - (20000 - p.now.costs - 750)) < 1e-6 && p.wait === null);
  check('even price gets back the cost', p.evenPrice > 150 && p.evenPrice < 152 && Math.abs(sellPlan({ ...base, price: p.evenPrice })!.now.inHand - 15000) < 1);
  const w = sellPlan({ ...base, payout: { dps: 10, bookClosure: 2, exDate: 1 } })!;
  check('hold through the dividend: price less the dividend, dividend after tax', w.wait!.price === 190 && Math.abs(w.wait!.dividend - 850) < 1e-9 && Math.abs(w.wait!.diff - (w.wait!.inHand - w.now.inHand)) < 1e-9);
  check('a loss pays no tax', sellPlan({ ...base, price: 100 })!.now.tax === 0);
  check('portions', portion(10, 0.25) === 3 && portion(1, 0.25) === 1 && portion(7, 1) === 7);
}

// Sector limits
{
  const h = [
    { symbol: 'MEBL', sector: 'Banks', value: 500 },
    { symbol: 'HBL', sector: 'Banks', value: 100 },
    { symbol: 'LUCK', sector: 'Cement', value: 400 },
  ];
  let l = setLimit({ all: null, per: {} }, null, 50);
  const rows = sectorShares(h, l);
  check('shares by sector, over the limit in rupees', rows[0].sector === 'Banks' && Math.abs(rows[0].share - 0.6) < 1e-9 && Math.abs(rows[0].over - 100) < 1e-9 && overLimit(rows).length === 1);
  l = setLimit(l, 'Banks', 70);
  check('own sector limit wins', overLimit(sectorShares(h, l)).length === 0 && setLimit(l, 'Banks', null).per.Banks === undefined && setLimit(l, null, 0).all === null);
}

// Where gains came from
{
  const g = growthSources({
    holdings: [{ symbol: 'A', shares: 110, avgCost: 10, price: 20 }],
    trades: [
      { day: '2026-01-01', symbol: 'A', side: 'buy', shares: 100, price: 10, realised: null },
      { day: '2026-03-01', symbol: 'A', side: 'buy', shares: 10, price: 10, realised: null },
    ],
    dividends: [{ day: '2026-02-01', symbol: 'A', amount: 150 }],
  });
  check('dividend cash used first by the next buy', g.reinvested === 100 && Math.abs(g.unspent - 50) < 1e-9 && Math.abs(g.fromDividends.A - 10) < 1e-9 && g.reinvestedNow === 200);
  check('price and dividend gains', g.priceNow === 1100 && g.dividends === 150 && g.priceSold === 0);
  const before = growthSources({ holdings: [], trades: [{ day: '2026-01-01', symbol: 'A', side: 'buy', shares: 1, price: 10, realised: null }], dividends: [{ day: '2026-02-01', symbol: 'A', amount: 5 }] });
  check('a buy before the dividend uses none of it', before.reinvested === 0 && before.unspent === 5);
}

// Morning notification
{
  const t = (d: string) => Date.parse(d + 'T00:00:00+05:00');
  const lines = morningLines({
    day: '2026-10-28',
    holdings: [
      { symbol: 'A', payout: { bookClosure: t('2026-10-30'), lastBuyDay: t('2026-10-28'), dps: 5, bonusPct: 0 }, results: null },
      { symbol: 'B', payout: { bookClosure: t('2026-10-29'), lastBuyDay: t('2026-10-27'), dps: 0, bonusPct: 10 }, results: { expected: '2026-10-28', meeting: null, label: 'Q1 2027' } },
      { symbol: 'C', payout: null, results: { expected: '2026-11-20', meeting: '2026-10-29', label: 'Q1 2027' } },
    ],
    notesDue: ['D'],
    lines: [
      { symbol: 'A', level: 100, close: 102, dir: '<' },
      { symbol: 'B', level: 100, close: 90, dir: '<' },
    ],
  });
  const txt = lines.map((l) => l.text);
  check('last day to buy first', txt[0] === 'A: last day to buy for its Rs 5.00 dividend', txt);
  check('book closure tomorrow, meeting, results, note, close line', txt.includes('B: book closure tomorrow (10% bonus)') && txt.includes('C: board meets tomorrow for Q1 2027 results') && txt.includes('B: Q1 2027 results may come today') && txt.includes('Look again at D (your note)') && txt.includes('A closed 2.0% from your Rs 100 line') && txt.length === 6, txt);
  const m = morningText(lines)!;
  check('notification text', m.title.endsWith('6 things') && m.body.split('\n').length === 5 && m.body.endsWith('+2 more') && morningText([]) === null, m);
  check('trading days skip weekends', nextTradingDays('2026-10-30', 3, (d) => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())).join() === '2026-10-30,2026-11-02,2026-11-03');
}

// Journal search
{
  const known = new Set(['LUCK', 'MEBL']);
  const notes = [
    { symbol: 'LUCK', why: 'Cement demand recovering, cheap on P/E', at: Date.parse('2026-03-01T06:00:00Z'), checkOn: null, then: { price: 700, divYield: 2, pe: 6 } },
    { symbol: 'MEBL', why: 'Islamic bank with a strong dividend', at: Date.parse('2026-05-01T06:00:00Z'), checkOn: null, then: { price: 250, divYield: 9, pe: 5 } },
  ];
  const trades = [
    { day: '2026-03-02', symbol: 'LUCK', side: 'buy' as const, shares: 10, price: 700, realised: null },
    { day: '2025-09-01', symbol: 'LUCK', side: 'sell' as const, shares: 5, price: 650, realised: -50 },
  ];
  const q = parseQuery('Why did I buy luck?', known);
  check('question parsed', q.symbols.join() === 'LUCK' && q.side === 'buy' && q.words.join() === '', q);
  const r = searchJournal('why did I buy LUCK', notes, trades, known).hits;
  check('note first, then the buy only', r.length === 2 && r[0].kind === 'note' && r[1].kind === 'trade' && (r[1] as { trade: { side: string } }).trade.side === 'buy', r);
  check('words search notes', searchJournal('dividends', notes, trades, known).hits.map((h) => h.symbol).join() === 'MEBL');
  check('sold in a year', searchJournal('sold 2025', notes, trades, known).hits.length === 1);
  check('nothing for unknown words', searchJournal('gold', notes, trades, known).hits.length === 0);
}

// Plain-word explanations
{
  const mine = [
    { symbol: 'SMALL', price: 10, shares: 10, pe: 4, divYield: 12, marketCap: 1e9 },
    { symbol: 'BIG', price: 100, shares: 1000, pe: null, divYield: 8, marketCap: 5e10 },
  ];
  check('example from the biggest holding that has the figure', pickExample(TERMS.pe, mine)!.startsWith('SMALL') && pickExample(TERMS.divYield, mine)!.startsWith('BIG'));
  check('no example without holdings or for plain terms', pickExample(TERMS.pe, []) === null && pickExample(TERMS.kibor, mine) === null);
  check('every term has a title and body', Object.values(TERMS).every((t) => t.title && t.body.length > 40));
  check('dividend example in rupees', pickExample(TERMS.divYield, mine)!.includes('Rs 8,000'), pickExample(TERMS.divYield, mine));
}

// Shariah corner
{
  const p = { defaultPct: 2, perStock: { MEBL: 0.5 }, nonCompliantFull: true };
  const s = shariahSummary(
    [
      { symbol: 'MEBL', value: 600, shariah: true, kmi30: true, received: 1000 },
      { symbol: 'LUCK', value: 300, shariah: true, kmi30: false, received: 500 },
      { symbol: 'HBL', value: 100, shariah: false, kmi30: false, received: 200 },
    ],
    p,
  );
  check('compliant share of money', Math.abs(s.compliantShare - 0.9) < 1e-9 && s.notCount === 1);
  check('purification: own rate, usual rate, all of a non-compliant dividend', Math.abs(s.purify - (5 + 10 + 200)) < 1e-9, s.lines.map((l) => l.purify));
  check('non-compliant at the usual rate when switched off', Math.abs(shariahSummary(s.lines, { ...p, nonCompliantFull: false }).purify - (5 + 10 + 4)) < 1e-9);
  check('rate cleared and clamped', setRate(p, 'MEBL', null).perStock.MEBL === undefined && setRate(p, 'X', 150).perStock.X === 100);
  const bc = (d: string) => Date.parse(d + 'T04:00:00Z');
  const got = dividendsReceived(
    [
      { dps: 5, bookClosure: bc('2026-03-10') },
      { dps: 3, bookClosure: bc('2025-05-01') },
      { dps: 0, bookClosure: bc('2026-04-01') },
    ],
    (day) => (day < '2026-03-01' ? 100 : 50),
    '2025-10-27',
    '2026-10-27',
  );
  check('dividends in the period on the shares held the day before', got.total === 250 && got.payments.length === 1, got);
}

// Saved screens
{
  const st = { mode: 'all' as const, filters: ['div8' as const, 'kse100' as const], sort: 'div' as const, sector: null, shariahOnly: true };
  let l = saveScreen([], ' Payers ', st, ['MEBL', 'FFC'], 1);
  check('saved with what matched', l.length === 1 && l[0].name === 'Payers' && l[0].seen.join() === 'FFC,MEBL');
  check('new since last looked', newSince(l[0], ['FFC', 'MEBL', 'OGDC']).join() === 'OGDC');
  l = markSeen(l, l[0].id, ['FFC', 'OGDC'], 2);
  check('marking seen replaces the list', newSince(l[0], ['FFC', 'OGDC', 'MEBL']).join() === 'MEBL' && l[0].seenAt === 2);
  const again = saveScreen(l, 'payers', { ...st, sort: 'pe' }, [], 3);
  check('same name replaces, keeps id', again.length === 1 && again[0].id === l[0].id && again[0].sort === 'pe');
  check('same settings ignores filter order', sameSettings(st, { ...st, filters: ['kse100', 'div8'] }) && !sameSettings(st, { ...st, shariahOnly: false }));
  check('suggested name', suggestName(st, (f) => f.toUpperCase(), (x) => x) === 'Shariah · DIV8 · KSE100');
  check('delete', deleteScreen(l, l[0].id).length === 0);
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tool checks passed');
