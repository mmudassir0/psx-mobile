/** Tests for the tools: compare, dividend income plan, rebalance, what-if. Run with `npx tsx scripts/test-tools.ts`. */
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

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tool checks passed');
