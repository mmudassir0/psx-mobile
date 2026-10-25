/** Return tracking, market mood and the dividend calendar. */
import { addSnapshot, flowBetween, indexReturns, mixReturns, trackReturns, type Snap, type TrackInput } from '../src/portfolio/track';
import { moodHistory, moodLabel, moodOutcomes } from '../src/analysis/mood';
import { calendarItems, type CalendarFeed } from '../src/analysis/calendar';
import type { Candle, SeriesPoint } from '../src/psx/types';
import { ewmaVol, priceRange } from '../src/analysis/range';
import { nextRateDecision, rateEvents } from '../src/analysis/events';
import { saleTax, cgtRate } from '../src/portfolio/tax';
import { lastBuyDay, exDate, rightsMaths } from '../src/analysis/dividends';
import { longTermList } from '../src/analysis/longterm';
import { goalStatus, monthsUntil, needed, project } from '../src/portfolio/goal';
import { lastMonth, summarizeMonth } from '../src/portfolio/monthly';
import { crossedToday, parseRules, rulesText } from '../src/analysis/watch';
import { lossOffsets, replayTrades, taxYearOf, taxYearSummary } from '../src/portfolio/trades';
import { checkTrades } from '../src/portfolio/screenshot';
import { buildMatcher, buildNews, coreName, parseRss } from '../src/analysis/news';
import { weekOf, weekOver, weeklyFacts } from '../src/portfolio/weekly';
import { healthCheck } from '../src/portfolio/health';
import type { Row } from '../src/portfolio/useReviews';
import type { Stock } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const DAY = 864e5;
const T0 = Date.UTC(2026, 0, 5, 7); // a Monday, Pakistan afternoon
const day = (i: number) => new Date(T0 + i * DAY + 5 * 3600e3).toISOString().slice(0, 10);
const row = (shares: number, avgCost: number, price: number, cash: TrackInput['cash'] = []): TrackInput[] => [{ symbol: 'ABC', shares, avgCost, price, cash }];

// --------------------------------------------------------------- tracking
let s: Snap[] = [];
s = addSnapshot(s, row(100, 10, 10), day(0));
s = addSnapshot(s, row(100, 10, 10.5), day(1));
s = addSnapshot(s, row(100, 10, 10), day(1)); // same day again: replaced
check('same day replaces the snapshot', s.length === 2 && s[1].value === 1000, s.map((x) => x.value));
check('missing price records nothing', addSnapshot(s, row(100, 10, 0), day(2)) === s);
s = addSnapshot(s, row(200, 10, 10), day(2)); // bought 100 more at 10
check('a buy is money in, not profit', near(flowBetween(s[1], s[2]), 1000), flowBetween(s[1], s[2]));
s = addSnapshot(s, row(200, 10, 11), day(3)); // +10%
s = addSnapshot(s, row(220, 2000 / 220, 10), day(4)); // 10% bonus, price adjusts
check('bonus shares are not money in', near(flowBetween(s[3], s[4]), 0));
s = addSnapshot(s, row(110, 2000 / 220, 10), day(5)); // sold half at 10
check('a sale is money out at the price', near(flowBetween(s[4], s[5]), -1100), flowBetween(s[4], s[5]));
s = addSnapshot(s, row(110, 2000 / 220, 9.5, [{ exT: T0 + 6 * DAY, dps: 0.5 }]), day(6)); // ex-dividend 0.5
check('dividend on the ex-date counted', near(s[6].div, 55), s[6].div);
const r = trackReturns(s);
check('return ignores buys, bonus, sales; counts dividends', near(r[r.length - 1].ret, 0.1, 1e-9), r.map((x) => +x.ret.toFixed(4)));
check('first point is zero', r[0].ret === 0 && r.length === s.length);

const idx: SeriesPoint[] = [0, 1, 2, 3, 6].map((i) => ({ t: T0 + i * DAY, v: 100 + i * 10, vol: 0 }));
const ir = indexReturns(idx, [day(0), day(4), day(6)]);
check('index aligned on or before each day', near(ir[0]!, 0) && near(ir[1]!, 0.3) && near(ir[2]!, 0.6), ir);

const candles: Candle[] = [10, 10, 11, 10.5].map((c, i) => ({ t: T0 + i * DAY, o: c, h: c, l: c, c, v: 1000 }));
const mix = mixReturns([{ shares: 100, candles, cash: [{ exT: T0 + 3 * DAY, dps: 0.5 }] }], [day(0), day(1), day(2), day(3)]);
check('current mix: price moves plus dividends', near(mix[2]!, 0.1) && near(mix[3]!, 0.1), mix);

// ------------------------------------------------------------------ mood
check('mood labels', moodLabel(10) === 'Extreme fear' && moodLabel(30) === 'Fear' && moodLabel(50) === 'Neutral' && moodLabel(70) === 'Greed' && moodLabel(90) === 'Extreme greed');
const N = 900;
// rises, falls hard, then rallies to new highs
const iv = (i: number) =>
  i < 450 ? 40000 * Math.exp(0.001 * i) : i < 620 ? 40000 * Math.exp(0.45 - 0.003 * (i - 450)) : 40000 * Math.exp(0.45 - 0.51 + 0.004 * (i - 620));
const index: SeriesPoint[] = Array.from({ length: N }, (_, i) => ({ t: T0 + i * DAY, v: iv(i), vol: 1e8 }));
const stocks = Array.from({ length: 30 }, (_, k) => ({
  candles: Array.from({ length: N }, (_, i) => {
    const c = (iv(i) / 500) * (1 + 0.01 * Math.sin(i / 7 + k));
    return { t: T0 + i * DAY, o: c, h: c, l: c, c, v: 1e6 };
  }),
}));
const hist = moodHistory(index, stocks, { minLiquidity: 1 });
const at = (i: number) => hist.find((h) => h.day === day(i));
check('mood is computed once there is history', hist.length > 300, hist.length);
check('falling market reads fearful', (at(615)?.score ?? 100) < 35, at(615));
check('rally to new highs reads greedy', (at(N - 1)?.score ?? 0) > 65, at(N - 1));
const out = moodOutcomes(hist, index);
check('outcomes per mood', out.length > 0 && out.every((o) => o.days > 0 && o.upShare >= 0 && o.upShare <= 1), out);

// -------------------------------------------------------------- calendar
const now = T0 + 3 * DAY;
const feed: CalendarFeed = {
  v: 1,
  kind: 'calendar',
  day: day(3),
  generatedAt: new Date(now).toISOString(),
  checked: 3,
  rows: [
    ['BBB', T0 + 12 * DAY, 5, 0, T0, 100],
    ['AAA', T0 + 9 * DAY, 2, 10, T0, 50],
    ['OLD', T0 - 5 * DAY, 3, 0, T0 - 30 * DAY, 60],
  ],
};
const items = calendarItems(feed, now);
check('calendar: past book closures dropped, sorted by date', items.map((x) => x.symbol).join() === 'AAA,BBB', items.map((x) => x.symbol));
check('calendar: yield and last buy day', near(items[0].yield!, 0.04) && items[0].lastBuyDay < items[0].bookClosure);
check('calendar: bad file is empty', calendarItems({ v: 2 } as unknown as CalendarFeed, now).length === 0);

// ----------------------------------------------------------------- range
const zig = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i % 2 ? 0.01 : 0));
check('volatility of ±1% swings is about 1%', near(ewmaVol(zig)!, 0.01, 1e-3), ewmaVol(zig));
const r1 = priceRange(zig, 1)!;
check('1-day 80% range is about ±1.3%', near(r1.pct, Math.exp(1.27 * 0.01) - 1, 1e-3) && r1.low < 100 * Math.exp(0.01) && r1.high > 100 * Math.exp(0.01), r1);
check('a month is wider than a day', priceRange(zig, 21)!.pct > priceRange(zig, 5)!.pct && priceRange(zig, 5)!.pct > r1.pct);
const wild = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i % 2 ? 0.2 : 0));
check('1-day range capped at the 10% circuit', priceRange(wild, 1)!.pct <= 0.1 + 1e-9, priceRange(wild, 1));
check('too little history: no range', priceRange(zig.slice(0, 30), 1) === null);
check('index ranges use their own widths', priceRange(zig, 21, 'index')!.pct > priceRange(zig, 21, 'stock')!.pct);

// ---------------------------------------------------------------- events
const oct20 = Date.UTC(2026, 9, 20, 6);
check('rate decision on 26 Oct is coming up', rateEvents(oct20).some((e) => e.day === '2026-10-26'));
check('next rate decision within 3 days only', nextRateDecision(oct20, 3) === null && nextRateDecision(Date.UTC(2026, 9, 24, 6), 3) === '2026-10-26');

// ------------------------------------------------------------------- tax
const st = saleTax(100, 120, 100, 'filer');
check('filer pays 15% on the gain', near(st.gain, 2000) && near(st.tax, 300) && near(st.keep, 11700), st);
check('a loss has no tax', saleTax(100, 80, 100, 'filer').tax === 0);
check('old shares: 2013–22 12.5%, pre-2013 0%', cgtRate('filer', '2013-22').rate === 0.125 && cgtRate('filer', 'pre2013').rate === 0);
check('2022–24 shares: falls with years held', cgtRate('filer', '2022-24', 0.5).rate === 0.15 && cgtRate('filer', '2022-24', 3.2).rate === 0.075 && cgtRate('filer', '2022-24', 7).rate === 0);
check('non-filer pays more', cgtRate('non-filer').rate > cgtRate('filer').rate);

// ------------------------------------------------------------- holidays
const pk = (t: number) => new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
const bc = Date.UTC(2026, 10, 11, 7); // Wed 11 Nov 2026, Mon 9 Nov is Iqbal Day
check('last day to buy skips the PSX holiday', pk(lastBuyDay(bc)) === '2026-11-06', pk(lastBuyDay(bc)));
check('ex-date is the working day before book closure', pk(exDate(bc)) === '2026-11-10', pk(exDate(bc)));

// ---------------------------------------------------------------- rights
const rm = rightsMaths(1000, 25, 50, 20);
check('rights: entitlement, cost, ex-rights price, value', rm.entitled === 250 && near(rm.cost, 5000) && near(rm.terp, 44) && near(rm.perRight, 24) && near(rm.valueOfRights, 6000), rm);
check('rights above market are worth nothing', rightsMaths(100, 20, 10, 15).perRight === 0);

// ------------------------------------------------------- long-term list
const mk = (sym: string, sector: string, price: number, eps: [number, number], trendUp = true) => ({
  symbol: sym,
  sector,
  candles: Array.from({ length: 260 }, (_, i) => {
    const c = trendUp ? price * (0.8 + (0.2 * i) / 259) : price * (1.2 - (0.2 * i) / 259);
    return { t: T0 + i * DAY, o: c, h: c, l: c, c, v: 1e6 };
  }),
  annual: { periods: ['2026', '2025'], rows: [{ label: 'EPS', values: [eps[0], eps[1]] }] },
});
const lt = longTermList([
  mk('CHEAP', 'BANK', 50, [10, 8]),
  mk('DEAR', 'BANK', 300, [10, 8]),
  mk('DEAR2', 'BANK', 400, [10, 8]),
  mk('DEAR3', 'BANK', 350, [10, 8]),
  mk('MID', 'BANK', 100, [10, 8]),
  mk('SHRINK', 'BANK', 40, [10, 12]),
  mk('FALLING', 'BANK', 45, [10, 8], false),
]);
check('long-term: cheap vs sector, growing, above trend', lt.list.map((r) => r.symbol).join() === 'CHEAP', lt.list.map((r) => r.symbol));
check('long-term: trend-only misses counted', lt.belowTrend === 1 && lt.valued === 7, lt);

// ------------------------------------------------------------------ goal
check('no growth: just add it up', near(project(1000, 100, 0, 12), 2200) && near(needed(1000, 2200, 0, 12), 100));
const pm = needed(100000, 1000000, 0.15, 60);
check('needed amount reaches the target', near(project(100000, pm, 0.15, 60), 1000000, 1), pm);
check('months until the end of the target month', monthsUntil('2031-12', Date.UTC(2026, 9, 25)) === 62);
const gs = goalStatus({ target: 1000000, by: '2031-12', rate: 0.15 }, 100000, 20000, Date.UTC(2026, 9, 25));
check('goal status: on course with enough each month', gs.onTrack === true && gs.need < 20000 && gs.realTarget < 1000000, gs);
check('last month wraps the year', lastMonth(Date.UTC(2027, 0, 10)) === '2026-12' && lastMonth(Date.UTC(2026, 9, 25)) === '2026-09');

// -------------------------------------------------------- month summary
const snapsM: Snap[] = [];
let sm: Snap[] = [];
const dayStr = (d: string) => d;
sm = addSnapshot(sm, row(100, 10, 10), dayStr('2026-09-30'));
sm = addSnapshot(sm, row(200, 10, 10), dayStr('2026-10-05')); // bought 100 at 10
sm = addSnapshot(sm, row(200, 10, 11), dayStr('2026-10-30')); // +10%
const ms = summarizeMonth([...snapsM, ...sm], '2026-10', null)!;
check('month: return excludes the money added', near(ms.ret, 0.1) && near(ms.flow, 1000) && !ms.partial && ms.from === '2026-09-30', ms);
check('month: movers', ms.movers[0].symbol === 'ABC' && near(ms.movers[0].change, 0.1));
check('month with no snapshots: nothing', summarizeMonth(sm, '2026-08', null) === null);

// holdings typed in later, bought long ago at a higher price: no fake one-day loss
let pasted: Snap[] = [];
pasted = addSnapshot(pasted, row(10, 100, 100), day(0));
pasted = addSnapshot(pasted, [...row(10, 100, 100), { symbol: 'OLD', shares: 100, avgCost: 120, price: 80, cash: [] }], day(1));
check('adding existing holdings is not a gain or loss', near(trackReturns(pasted)[1].ret, 0), trackReturns(pasted));

// ------------------------------------------------------------ price alerts
const pr = parseRules('SYS<100, mebl > 600\nLUCK>200d; bad rule');
check('rules parse, bad ones reported', pr.rules.length === 3 && pr.bad.length === 1 && pr.rules[2].level === 'ma200' && rulesText(pr.rules) === 'SYS<100, MEBL>600, LUCK>200d', pr);
check('alert only on the crossing day', crossedToday({ symbol: 'X', dir: '<', level: 100 }, [105, 99]) && !crossedToday({ symbol: 'X', dir: '<', level: 100 }, [98, 97]));
const up200 = [...Array.from({ length: 200 }, () => 100), 99, 101];
check('crossing the 200-day average', crossedToday({ symbol: 'X', dir: '>', level: 'ma200' }, up200));

// ------------------------------------------------------- tax year, offsets
check('tax year runs July to June', taxYearOf('2026-07-01') === 2027 && taxYearOf('2026-06-30') === 2026);
const ty = taxYearSummary(
  [
    { day: '2026-08-01', symbol: 'A', side: 'sell', shares: 10, price: 120, avgCost: 100, realised: 200 },
    { day: '2026-09-01', symbol: 'B', side: 'sell', shares: 10, price: 90, avgCost: 100, realised: -50 },
    { day: '2026-05-01', symbol: 'C', side: 'sell', shares: 10, price: 200, avgCost: 100, realised: 1000 },
  ],
  2027,
);
check('this year only: gains, losses, net', ty.gains === 200 && ty.losses === 50 && ty.net === 150 && ty.sales === 2, ty);
const off = lossOffsets([{ symbol: 'L1', shares: 10, avgCost: 100, price: 90 }, { symbol: 'L2', shares: 10, avgCost: 100, price: 80 }, { symbol: 'W', shares: 10, avgCost: 100, price: 120 }], 150, 0.15);
check('biggest loss first, savings capped by the gain', off.length === 2 && off[0].symbol === 'L2' && near(off[0].saves, 150 * 0.15) && off[1].saves === 0, off);

const hr0 = (symbol: string, value: number) => ({ holding: { symbol, shares: 1, avgCost: value }, price: value, value, weight: 0, review: null, dividends: null, fund: false, results: null }) as unknown as Row;
// ------------------------------------------------------------------ news
check('core names', coreName('Lucky Cement Limited') === 'Lucky Cement' && coreName('Pakistan Limited') === null && coreName('Lucky Limited') === null, [coreName('Lucky Cement Limited'), coreName('Interloop Limited')]);
const mm = buildMatcher([
  { symbol: 'LUCK', name: 'Lucky Cement Limited' },
  { symbol: 'ILP', name: 'Interloop Limited' },
  { symbol: 'OGDC', name: 'Oil & Gas Development Company Limited' },
  { symbol: 'PSX', name: 'Pakistan Stock Exchange Limited' },
]);
check('matcher: names, aliases, symbols', mm.match("Pakistan's Interloop to expand").join() === 'ILP' && mm.match('OGDCL finds gas').join() === 'OGDC' && mm.match('Lucky cement sales up').join() === 'LUCK' && mm.match('lucky draw winners').length === 0, mm.match('OGDCL finds gas'));
const rss = '<rss><channel><item><title><![CDATA[PSX down 4,045 points]]></title><link>https://x.pk/1</link><pubDate>Sat, 24 Oct 26 21:06:42 +0500</pubDate></item><item><title>Indian rupee falls as inflation bites</title><link>https://x.pk/2</link><pubDate>Sat, 24 Oct 2026 10:00:00 +0500</pubDate></item><item><title>Cricket: Pakistan win</title><link>https://x.pk/3</link><pubDate>Sat, 24 Oct 2026 10:00:00 +0500</pubDate></item><item><title>Lucky Cement profit rises &amp; dividend</title><link>https://x.pk/4</link><pubDate>Sat, 24 Oct 2026 09:00:00 +0500</pubDate></item></channel></rss>';
const parsedRss = parseRss(rss);
check('rss: parses titles, links, both date styles, entities', parsedRss.length === 4 && parsedRss[3].title === 'Lucky Cement profit rises & dividend' && new Date(parsedRss[0].t).getUTCFullYear() === 2026, parsedRss.map((x) => x.title));
const built = buildNews(parsedRss.map((item) => ({ source: 0, item })), mm, Date.UTC(2026, 9, 25));
check('news: market stories kept, foreign and off-topic dropped, PSX not a company tag', built.length === 2 && built.some((r) => r[2].startsWith('PSX') && r[5] && !r[4].length) && built.some((r) => r[4].join() === 'LUCK'), built.map((r) => [r[2], r[4], r[5]]));

// ------------------------------------------------------- imported trades
const ct = checkTrades('{"trades":[{"date":"2024-03-15","symbol":"luck","side":"Buy","shares":"1,000","price":"402.10"},{"date":"15/03/24","symbol":"X","side":"buy","shares":1,"price":1},{"date":"2099-01-01","symbol":"OGDC","side":"sell","shares":5,"price":10}]}', undefined, Date.UTC(2026, 9, 25));
check('trade screenshots: good rows kept, bad dates rejected', ct.trades.length === 1 && ct.trades[0].symbol === 'LUCK' && ct.trades[0].shares === 1000 && ct.rejected.length === 2, ct);
const rp = replayTrades([
  { date: '2023-01-10', symbol: 'A', side: 'buy', shares: 100, price: 10 },
  { date: '2024-09-01', symbol: 'A', side: 'buy', shares: 100, price: 20 },
  { date: '2025-01-05', symbol: 'A', side: 'sell', shares: 100, price: 30 },
  { date: '2022-01-01', symbol: 'B', side: 'buy', shares: 50, price: 10 },
  { date: '2025-02-01', symbol: 'C', side: 'sell', shares: 10, price: 5 },
]);
const sale = rp.records.find((r) => r.symbol === 'A' && r.side === 'sell')!;
check('replay: profit on a sale at average cost', near(sale.realised!, (30 - 15) * 100), sale);
check('replay: first in, first out for buy dates', rp.positions.get('A')!.shares === 100 && rp.bought.get('A') === 'recent' && rp.bought.get('B') === '2013-22', [...rp.bought]);
check('replay: a sale without its buy is flagged', rp.incomplete.has('C') && rp.records.find((r) => r.symbol === 'C')!.realised === null);

// ----------------------------------------------------------- weekly brief
check('brief week: weekdays and weekend map to that Friday', weekOf(Date.UTC(2026, 9, 21, 7)) === '2026-10-23' && weekOf(Date.UTC(2026, 9, 25, 7)) === '2026-10-23');
check('week over: Friday evening and weekend only', weekOver(Date.UTC(2026, 9, 23, 12)) && weekOver(Date.UTC(2026, 9, 24, 7)) && !weekOver(Date.UTC(2026, 9, 23, 6)));
const facts = weeklyFacts([hr0('LUCK', 1000), hr0('OGDC', 500)], { LUCK: Array.from({ length: 10 }, (_, i) => ({ t: i, o: 1, h: 1, l: 1, c: 100 + i, v: 1 })), OGDC: null }, { mood: 17, indexWeek: -0.02, breadth: 0.2, now: Date.UTC(2026, 9, 23, 12) });
check('brief facts: index, mood, holdings with weekly change', facts.includes('KSE-100 this week: -2.0%') && facts.includes('Extreme fear') && facts.includes('- LUCK, 66.7%, +4.8%') && facts.includes('- OGDC, 33.3%, n/a'), facts);

// ---------------------------------------------------------- health check
const hr = (symbol: string, value: number, sector: string, action: string | null = 'Hold') =>
  ({ holding: { symbol, shares: 1, avgCost: value }, stock: { symbol, sector, indexes: [] } as unknown as Stock, price: value, value, weight: 0, review: action ? { action } : null, dividends: null, fund: false, results: null }) as unknown as Row;
const rowsH = [hr('BIG', 300, 'CEMENT'), hr('B', 200, 'OIL'), hr('C', 200, 'OIL'), hr('D', 280, 'FERT'), hr('T', 10, 'PHARMA', 'Review'), hr('E', 10, 'TECH')];
const idxStocks = [{ symbol: 'BANK1', sector: 'COMMERCIAL BANKS', marketCap: 500, indexes: ['KMI30'] }, { symbol: 'B', sector: 'OIL', marketCap: 500, indexes: ['KMI30'] }] as unknown as Stock[];
const hc = healthCheck(rowsH, idxStocks, 'KMI30');
const keys = hc.map((x) => x.key);
check('health: big stock, big sector, tiny, review, index gap', keys.includes('stock-BIG') && keys.includes('sector-OIL') && keys.includes('tiny') && keys.includes('review') && keys.includes('gap-COMMERCIAL BANKS'), keys);
check('health: worst first', hc[0].level === 'bad');

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tracking, mood and calendar checks passed');
