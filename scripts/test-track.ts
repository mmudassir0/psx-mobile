/** Return tracking, market mood and the dividend calendar. */
import { addSnapshot, flowBetween, indexReturns, mixReturns, trackReturns, type Snap, type TrackInput } from '../src/portfolio/track';
import { moodHistory, moodLabel, moodOutcomes } from '../src/analysis/mood';
import { calendarItems, type CalendarFeed } from '../src/analysis/calendar';
import type { Candle, SeriesPoint } from '../src/psx/types';

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

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tracking, mood and calendar checks passed');
