/** Checks for the backtesting lab: data encoding, the engine's arithmetic, no peeking ahead, and the dividend notice reader. */
import { buildLab, type Bar } from '../src/lab/build';
import { decodeLab, type Lab } from '../src/lab/data';
import { irr, metricAt, runBacktest, type Strategy } from '../src/lab/engine';
import { BASE, TEMPLATES } from '../src/lab/templates';
import { describe, toStrategy } from '../src/lab/describe';
import { robustness } from '../src/lab/robust';
import { firstDate, parseDivNotice } from '../src/lab/divText';
import { labPrompt, readLabReply } from '../src/lab/aiStrategy';
import { checkDue, followPlan, nextCheck } from '../src/lab/follow';
import { defaultSetup, ideas, summarise, tryIdea } from '../src/lab/hunt';
import { rollOne, rollStarts, summariseRolling } from '../src/lab/rolling';
import { reviewTest } from '../src/lab/reviewTest';
import { labReportHtml } from '../src/lab/report';
import { recentExits } from '../src/lab/follow';
import { readCode, strategyCode } from '../src/lab/share';
import { worstFalls } from '../src/lab/stress';
import { runMix } from '../src/lab/mix';
import { isLabQuestion, labResultText } from '../src/lab/aiLab';
import { breadthOf, inUniverse } from '../src/lab/engine';
import { membershipHistory, parseIndexNotice, spansOf } from '../src/lab/kmiText';
import { divCalendar } from '../src/lab/divCalendar';

let failed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || extra === undefined ? '' : '  ' + JSON.stringify(extra)}`);
  if (!ok) failed++;
}

// ---------------------------------------------------------------- a small made-up market
const DAY = 864e5;
const t0 = Date.UTC(2016, 0, 4, 7);
const days: number[] = [];
for (let t = t0; days.length < 252 * 5; t += DAY) {
  const wd = new Date(t).getUTCDay();
  if (wd !== 0 && wd !== 6) days.push(t);
}
const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const series = (f: (i: number) => number, vol = 1e6): Bar[] => days.map((t, i) => [t, f(i), f(i), f(i), f(i), vol]);
const UP = series((i) => 100 * Math.pow(1.001, i)); // steady +0.1% a day
const FLAT = series(() => 50);
const DOWN = series((i) => 200 * Math.pow(0.999, i));
// a bonus the adjusted prices missed: price halves overnight
const GAP = series((i) => (i < 600 ? 80 : 40));
const index = new Map(days.map((t, i) => [pk(t), 1000 * Math.pow(1.0005, i)]));
const file = buildLab({
  built: '2020-12-31',
  index: { KSE100: index, KMI30: index },
  divFrom: '2016-01-01',
  stocks: [
    { symbol: 'UPCO', sector: 'A', kse100: true, kmi30: true, shariah: true, bars: UP, divs: [], eps: [{ day: pk(days[300]), eps: 10 }] },
    {
      symbol: 'FLAT',
      sector: 'B',
      kse100: true,
      kmi30: false,
      shariah: false,
      bars: FLAT,
      divs: [
        { day: pk(days[400]), dps: 5 },
        { day: pk(days[700]), dps: 5 },
      ],
      eps: [],
    },
    { symbol: 'DOWN', sector: 'A', kse100: false, kmi30: false, shariah: true, bars: DOWN, divs: [], eps: [] },
    { symbol: 'GAPCO', sector: 'C', kse100: false, kmi30: false, shariah: false, bars: GAP, divs: [], eps: [] },
  ],
});
const lab: Lab = decodeLab(JSON.parse(JSON.stringify(file)));
check('decode: days and closes round-trip', lab.days.length === days.length && Math.abs(lab.stocks.find((s) => s.symbol === 'UPCO')!.close[1000] - UP[1000][4]) < 0.006);
check('decode: flags', lab.stocks.find((s) => s.symbol === 'UPCO')!.kmi30 && !lab.stocks.find((s) => s.symbol === 'FLAT')!.shariah);
const gap = lab.stocks.find((s) => s.symbol === 'GAPCO')!;
check('build: a gap no limit allows is carried back', Math.abs(gap.close[100] - 40) < 0.01 && Math.abs(gap.close[700] - 40) < 0.01);
check('decode: dividends on the ex-day', lab.stocks.find((s) => s.symbol === 'FLAT')!.divs.length === 2 && lab.stocks.find((s) => s.symbol === 'FLAT')!.divs[0].i === 400);

const S = (p: Partial<Strategy>): Strategy => ({ ...BASE, id: 't', name: 't', minValue: 0, perSector: 0, costs: false, tax: 'none', lump: 100000, monthly: 0, from: 2017, ...p });

// ---------------------------------------------------------------- engine
{
  const r = runBacktest(lab, S({ rank: 'mom12', hold: 1, every: 1 }));
  check('momentum picks the riser', r.holdings[0]?.symbol === 'UPCO', r.holdings);
  const years = r.value.length / 252;
  const want = Math.pow(1.001, 252) - 1;
  check('growth matches the stock (no costs)', Math.abs(r.stats.cagr - want) < 0.01, { cagr: r.stats.cagr, want, years });
  check('trades: bought once, never sold', r.trades.length === 1 && r.trades[0].side === 'buy');
  check('no peeking: first buy is at the start day close', r.trades[0].i === r.start);
  const c = runBacktest(lab, S({ rank: 'mom12', hold: 1, every: 1, costs: true }));
  check('costs cost something', c.stats.final < r.stats.final && c.stats.costs > 0);
}
{
  // dividends: hold only FLAT (price never moves): the whole return is the dividends
  const r = runBacktest(lab, S({ universe: 'kse100', rank: 'price', desc: false, hold: 1, every: 12 }));
  check('dividend stock chosen', r.holdings[0]?.symbol === 'FLAT');
  const sh = r.holdings[0].shares;
  check('dividends paid on shares held', Math.abs(r.stats.dividends - sh * 5 * (lab.days[400] >= lab.days[r.start] ? 2 : 1)) < 1, { div: r.stats.dividends, sh });
  const taxed = runBacktest(lab, S({ universe: 'kse100', rank: 'price', desc: false, hold: 1, every: 12, tax: 'filer' }));
  check('dividend tax at 15%', Math.abs(taxed.stats.dividends - r.stats.dividends * 0.85) < 1 && taxed.stats.tax > 0);
  const y = metricAt as unknown;
  check('trailing yield metric exists', typeof y === 'function');
}
{
  // a filter nothing passes: all cash, warned
  const r = runBacktest(lab, S({ filters: [{ m: 'price', op: '>', v: 1e6 }] }));
  check('nothing passes: stays in cash', r.trades.length === 0 && Math.abs(r.stats.final - 100000) < 1 && r.warnings.length > 0);
  // a stop: DOWN falls 0.1% a day, so a 10% stop sells it
  const d = runBacktest(lab, S({ universe: 'shariah', rank: 'price', desc: true, hold: 1, every: 12, stop: 0.1 }));
  check(
    'stop sells a faller',
    d.trades.some((t) => t.side === 'sell' && t.why === 'stop'),
    d.trades.slice(0, 4),
  );
  // monthly money: put in grows each month
  const m = runBacktest(lab, S({ rank: 'mom12', hold: 1, every: 1, lump: 0, monthly: 10000 }));
  check('monthly money is added', m.stats.put > 10000 * 40 && m.stats.irr != null && m.stats.irr > 0.2);
  // benchmark gets the same money
  check('benchmark with the same money', Math.abs(m.invested[m.invested.length - 1] - m.stats.put) < 1 && m.bench[m.bench.length - 1] > m.stats.put);
  // years add up to the whole
  const total = m.years.reduce((a, y) => a * (1 + y.ret), 1);
  check('years multiply to the whole', Math.abs(total - m.growth[m.growth.length - 1]) < 1e-6);
  // halves of the period
  const v = robustness(lab, S({ rank: 'mom12', hold: 2, every: 1 }), m);
  check('robustness has variants', v.length >= 3);
}
check('irr of doubling in a year', Math.abs((irr([-100, ...new Array(11).fill(0), 200]) ?? 0) - 1) < 0.01);
check(
  'templates describe themselves',
  TEMPLATES.every((t) => describe(t.strategy).length > 20),
);
check(
  'templates all run',
  TEMPLATES.every((t) => runBacktest(lab, t.strategy).value.length > 0),
);
check(
  'toStrategy fixes bad input',
  toStrategy({
    name: 'x',
    hold: 999,
    every: 5,
    rank: 'nope',
    filters: [
      { m: 'pe', op: '<', v: 8 },
      { m: 'bad', op: '>', v: 1 },
    ],
  })!.hold === 100,
);
check(
  'toStrategy keeps good filters only',
  toStrategy({
    filters: [
      { m: 'pe', op: '<', v: 8 },
      { m: 'bad', op: '>', v: 1 },
    ],
  })!.filters.length === 1,
);
check('toStrategy rejects junk', toStrategy(null) === null && toStrategy('x') === null);

// ---------------------------------------------------------------- dividend notices
const notice = (t: string) => {
  const r = parseDivNotice(t);
  return r.nil ? 'nil' : r.dps != null ? `${r.dps}${r.closeFrom ? ' ' + r.closeFrom : ''}` : r.pct != null ? `pct${r.pct}` : '-';
};
const cases: [string, string][] = [
  ['1.1. Cash Dividend. NIL\n which combined with dividend income stood', 'nil'],
  ['We are pleased to inform you that the Final Cash Dividend @ Rs.15/- per share i.e. 150% for the', '15'],
  ['(I) Cash Dividend Rs.15/- per share\nThe Share Transfer Books of the Company will remain closed from Monday, September 16, 2024 to Thursday,', '15 2024-09-16'],
  [
    'CASH DIVIDEND\nAn Interim cash dividend for the quarter ended September 30, 2024 @ Rs 3.00 per share i.e.\nMembers on November 07, 2024. The Share Transfer Books of the Company will be closed from November 08, 2024 to',
    '3 2024-11-08',
  ],
  ["on Friday, October 25, 2024 at 11:30 a.m. at Karachi has recommended a 'NIL' dividend.", 'nil'],
  [
    'CASH DIVIDEND\nFinal Cash Dividend for the financial year ended June 30, 2024 at the rate of Rs. 10/- per share\nThe share transfer books of the company will remain closed from Thursday, October 17, 2024 to',
    '10 2024-10-17',
  ],
  ['a. CASH DIVIDEND :\n A final cash dividend for the year June 30, 2024 @ 134/- per share i.e. 1,340%. This is in addition to the interim dividend already paid @ Rs 98 per share', '134'],
  [
    '(i) CASH DIVIDEND\nAn Interim Cash Dividend for the nine months ended September 30, 2024 @ Rs. 5.00 per share i.e. 50%.\nThis is in addition to the interim cash dividend already paid at Rs. 19.00 per share i.e. 190%.\nThe Share Transfer Books of the Company will remain closed from Monday — November 11, 2024 to Tuesday',
    '5 2024-11-11',
  ],
  ['The Board has recommended a final cash dividend of 45% (Rs. 4.50 per share). Books will remain closed from 16-09-2019 to 23-09-2019', '4.5 2019-09-16'],
  ['Cash dividend @ 25% i.e.', 'pct25'],
  ['DIVIDEND\n Basic earnings per share 12 18.54 24.57', '-'],
];
for (const [t, want] of cases) check(`notice: ${want}`, notice(t) === want, { got: notice(t), t: t.slice(0, 50) });
check('notice: face value hint', parseDivNotice('Final Cash Dividend @ Rs.15/- per share i.e. 150% for the').pctToo === 150);
check('dates', firstDate('Monday, 16th September, 2024') === '2024-09-16' && firstDate('w.e.f 05-11-2018') === '2018-11-05');

{
  const cur = S({ name: 'Mine', lump: 50000 });
  const m = labPrompt('cheap dividend stocks', cur);
  check('ai prompt lists the metrics', m[0].content.includes('yield') && m[1].content.includes('cheap dividend'));
  const r = readLabReply(
    'Sure! {"name":"Cheap payers","universe":"kse100","filters":[{"m":"yield","op":">","v":7},{"m":"pe","op":"<","v":8}],"rank":"yield","desc":true,"hold":8,"every":6,"note":"P/E only from 2023."}',
    cur,
  );
  check('ai reply read', !!r && r.strategy.hold === 8 && r.strategy.filters.length === 2 && r.strategy.lump === 50000 && r.note === 'P/E only from 2023.');
  check('ai reply junk', readLabReply('no json here', cur) === null);
}

{
  const q = S({ every: 3, from: 2017 });
  const start = runBacktest(lab, q).start;
  const d0 = lab.days[start];
  const plus = (m: number) => {
    const y = Number(d0.slice(0, 4)),
      mm = Number(d0.slice(5, 7)) - 1 + m;
    return `${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}`;
  };
  check('follow: check months every three', checkDue(lab, q, `${plus(3)}-02`) && !checkDue(lab, q, `${plus(4)}-02`) && !checkDue(lab, q, `${plus(3)}-20`));
  check('follow: next check', nextCheck(lab, q, `${plus(1)}-15`) === `${plus(3)}-01`);
  check('follow: plan', followPlan(['A', 'B', 'C'], ['B', 'X']).missing.join() === 'A,C');
}

{
  const setup = { ...defaultSetup(lab, 'all'), split: 2019 };
  const list = ideas(setup);
  check('hunt: many ideas, unique ids, same order each time', list.length > 1000 && new Set(list.map((x) => x.id)).size === list.length && ideas(setup)[5].name === list[5].name);
  const res = list.slice(0, 30).map((s) => tryIdea(lab, s, setup));
  check('hunt: both periods run', res.every((r) => Number.isFinite(r.train.cagr)) && res.some((r) => r.test));
  const s = summarise(res, 5);
  check('hunt: summary', s.top.length === 5 && s.tried === 30 && s.topHeld <= 5);
}

{
  const st = S({ rank: 'mom12', hold: 2, every: 1 });
  const starts = rollStarts(lab, 1, 3);
  const rows = starts.map((m) => rollOne(lab, st, m, 1));
  const sum = summariseRolling(rows, 1)!;
  check('rolling: starts and summary', starts.length >= 3 && sum.rows.length === starts.length && sum.best.cagr >= sum.worst.cagr);
  check('rolling: one year span', runBacktest(lab, { ...st, fromDay: `${starts[0]}-01`, untilDay: `${starts[1]}-01` }).value.length < 80);
  const rv = reviewTest(lab, 'all', 0);
  check('review test runs', rv.months > 10 && Object.values(rv.groups).some((g) => g.n > 0));
  const only = runBacktest(lab, S({ only: ['FLAT'], rank: 'value', hold: 5, every: 12 }));
  check('only these symbols', only.holdings.every((h) => h.symbol === 'FLAT') && only.holdings.length === 1);
  const html = labReportHtml(lab, st, runBacktest(lab, st), '2026-10-28');
  check('report html', html.includes('<svg') && html.includes('Year by year') && html.length > 2000);
  const stop = runBacktest(lab, S({ universe: 'shariah', rank: 'price', desc: true, hold: 1, every: 12, stop: 0.1 }));
  check('recent exits from trades', recentExits(lab, stop.trades, lab.days.length).length > 0);
}

{
  const st = S({ name: 'Ünïcode test', filters: [{ m: 'yield', op: '>', v: 6 }], sectors: ['A'], topSectors: 2, lump: 5 });
  const code = strategyCode(st);
  const back = readCode(`look at this: ${code} cool`, 'x')!;
  check('share code round-trip', !!back && back.name === st.name && back.filters[0].v === 6 && back.sectors?.[0] === 'A' && back.topSectors === 2 && back.id === 'x' && back.lump === BASE.lump);
  check('share code junk', readCode('SAHM1-!!!', 'x') === null && readCode('hello', 'x') === null);
  const sec = runBacktest(lab, S({ sectors: ['B'], rank: 'price', hold: 3, every: 12 }));
  check(
    'sectors: only that sector',
    sec.holdings.every((h) => h.symbol === 'FLAT'),
  );
  const rot = runBacktest(lab, S({ topSectors: 1, rank: 'price', hold: 3, every: 12 }));
  check('rotation needs 3 stocks in a sector', rot.trades.length === 0);
  const r = runBacktest(lab, S({ rank: 'mom12', hold: 2, every: 1 }));
  const profit = r.bySymbol.reduce((a, x) => a + x.pnl, 0);
  check('stocks behind the result add up', Math.abs(profit - (r.stats.final - r.stats.put)) < 2, { profit, made: r.stats.final - r.stats.put });
  check('worst falls run', Array.isArray(worstFalls(lab, r)));
}

{
  const a = S({ rank: 'mom12', hold: 1, every: 1 });
  const b = S({ universe: 'kse100', rank: 'price', desc: false, hold: 1, every: 12 });
  const mx = runMix(
    lab,
    [
      { strategy: a, share: 1 },
      { strategy: b, share: 1 },
    ],
    100000,
    0,
  )!;
  const ra = runBacktest(lab, { ...a, lump: 50000, fromDay: lab.days[mx.start] });
  check(
    'mix: value is the sum of the pots',
    Math.abs(mx.value[mx.value.length - 1] - (mx.parts[0].result.value[mx.value.length - 1] + mx.parts[1].result.value[mx.value.length - 1])) < 1 && Math.abs(mx.parts[0].result.stats.final - ra.stats.final) < 1,
  );
  check('mix: growth between the parts', mx.cagr <= Math.max(...mx.parts.map((p) => p.result.stats.cagr)) + 1e-9 && mx.cagr >= Math.min(...mx.parts.map((p) => p.result.stats.cagr)) - 1e-9);
  const br = breadthOf(lab);
  check(
    'breadth between 0 and 1',
    Array.from(br)
      .filter((x) => !Number.isNaN(x))
      .every((x) => x >= 0 && x <= 1),
  );
  const p = runBacktest(lab, S({ rank: 'mom12', hold: 2, every: 1, pauseBelow: 0.99 }));
  check('pause: weak market sits in cash', p.stats.pauses >= 1 && p.trades.every((t) => (t.side === 'buy' ? true : t.why === 'pause' || t.why === 'rebalance' || t.why === 'stop')));
  const cashOnly = runBacktest(lab, S({ filters: [{ m: 'price', op: '>', v: 1e9 }], cashEarns: true }));
  check('cash earns', cashOnly.stats.final > 100000 * 1.1 && cashOnly.stats.cashProfit > 0);
  check('lab questions spotted', isLabQuestion('How did buying banks after a 20% fall do since 2019?') && isLabQuestion('backtest dividend stocks') && !isLabQuestion('What is the P/E of FFC?'));
  check('lab result text', labResultText(lab, a, runBacktest(lab, a)).includes('a year against'));
}

{
  const text = `The recomposed Index will be implemented w.e.f Friday July 15, 2022.
                                      LIST OF INCOMING / OUTGOING COMPANIES
 Sr.no                          Incoming                                            Outgoing
   1       AABS       Al-Abbas Sugar Mills Ltd               ADOS      Ados Pakistan Limited.
   2       AIRLINK    Air Link Communication Limited         AGHA      Agha Steel Industries Ltd.
   3       ALNRS      Al-Noor Sugar Mills Ltd.
`;
  const e = parseIndexNotice(text, '2022-07-07')!;
  check('index notice: in, out, date', e.date === '2022-07-15' && e.in.join() === 'AABS,AIRLINK,ALNRS' && e.out.join() === 'ADOS,AGHA', e);
  const names = parseIndexNotice(
    `  Sr.no.   Incoming Companies                 Outgoing Companies
    1      GlaxoSmithKline Pakistan Ltd       Lotte Chemical Pakistan Ltd.
    2      ICI Pakistan Limited               Hascol Petroleum Ltd.
    3      Kohat Cement Company Ltd           Indus Motor Company Ltd.
`,
    '2020-12-04',
  );
  check('index notice: names only are ignored', names === null || (!names.in.length && !names.out.length));
  const h = membershipHistory(
    ['A', 'B', 'C'],
    [
      { date: '2022-07-15', in: ['C'], out: ['D'] },
      { date: '2021-01-01', in: ['B'], out: ['E'] },
    ],
  );
  const sp = spansOf(h);
  check('membership walks back', h[0].members.join() === 'A,D,E' && sp.get('C')![0][0] === '2022-07-15' && sp.get('D')![0][1] === '2022-07-15');
  const withSpans = buildLab({
    built: '2020-12-31',
    index: { KSE100: index, KMI30: index },
    divFrom: '2016-01-01',
    stocks: [{ symbol: 'UPCO', sector: 'A', kse100: true, kmi30: true, shariah: true, bars: UP, divs: [], eps: [], shariahSpans: [[pk(days[600]), '']] }],
  });
  const l2 = decodeLab(JSON.parse(JSON.stringify(withSpans)));
  const up = l2.stocks[0];
  check('shariah of the time', !inUniverse(up, 'shariah', 100) && inUniverse(up, 'shariah', 700) && inUniverse(up, 'shariah'));
  const cal = divCalendar(lab, 2016);
  check('dividend calendar', cal.length === 12 && cal.flat().every((x) => x.years <= x.of));
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall lab checks passed');
