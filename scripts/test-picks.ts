import { playOut, Levels, PICK_COST, setupsAt } from '../src/analysis/picks';
import { computeSeries } from '../src/analysis/signals';
import { breadthOf, choosePicks, expectedDay, freshness, pickText, pkDay, scorePick, statsOf, Pick, ScoredPick } from '../src/picks/build';
import { parseFeed, parseFeeds } from '../src/picks/feed';
import type { Candle } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-9;
const D0 = Date.UTC(2026, 0, 5) - 5 * 3600e3; // midnight Pakistan time
const bar = (d: number, o: number, h: number, l: number, c: number): Candle => ({ t: D0 + d * 864e5, o, h, l, c, v: 1e6 });
const L: Levels = { entryLow: 98, entryHigh: 100, stop: 94, tp1: 105, tp2: 115 };

let o = playOut([bar(1, 102, 103, 101, 102), bar(2, 101, 102, 101, 101), bar(3, 101, 104, 100.5, 103)], L, 3, 20);
check('not bought when the zone is never reached in 3 days', o.result === 'no-fill' && o.ret == null);
o = playOut([bar(1, 101, 101, 99, 100), bar(2, 99, 100, 93, 94)], L, 3, 20);
check('stopped out: loss from the zone top to the stop, after costs', o.result === 'stop' && near(o.ret, 94 / 100 - 1 - PICK_COST), o);
o = playOut([bar(1, 99, 99.5, 97, 99), bar(2, 100, 106, 99, 104), bar(3, 104, 116, 103, 115)], L, 3, 20);
check('opened inside the zone: bought at the open; half at TP1, rest at TP2', o.result === 'tp2' && near(o.ret, (105 / 2 + 115 / 2) / 99 - 1 - PICK_COST), o);
o = playOut([bar(1, 101, 101, 99, 100), bar(2, 100, 106, 99, 104), bar(3, 104, 104, 99, 99)], L, 3, 20);
check('after TP1 the stop moves to the entry', o.result === 'tp1-then-even' && near(o.ret, (105 / 2 + 100 / 2) / 100 - 1 - PICK_COST), o);
o = playOut([bar(1, 101, 106, 93, 100)], L, 3, 20);
check('a day touching both stop and target counts as the stop', o.result === 'stop');
o = playOut([bar(1, 101, 101, 99, 100), bar(2, 100, 101, 99, 100.5), bar(3, 100.5, 101, 100, 101)], L, 3, 2);
check('closed at the time limit', o.result === 'time' && near(o.ret, 101 / 100 - 1 - PICK_COST), o);
check('still running is "open"', playOut([bar(1, 101, 101, 99, 100)], L, 3, 20).result === 'open');

// Selection on synthetic stocks: a steady uptrend with a fresh dip qualifies; a downtrend doesn't.
const series = (n: number, f: (i: number) => number): Candle[] =>
  Array.from({ length: n }, (_, i) => { const c = f(i); return { t: D0 + i * 864e5, o: c, h: c * 1.01, l: c * 0.99, c, v: 2e6 }; });
const full = series(330, (i) => 100 * Math.exp(0.003 * i) * (1 + 0.01 * Math.sin(i / 3)));
// End the uptrend on a day that shows a setup.
let cut = 300;
while (cut < full.length && !setupsAt(computeSeries(full.slice(0, cut)), cut - 1).length) cut++;
const up = full.slice(0, cut);
const down = series(cut, (i) => 300 * Math.exp(-0.003 * i));
const day = pkDay(up[up.length - 1].t);
const picks = choosePicks([{ symbol: 'UP', candles: up }, { symbol: 'DOWN', candles: down }], day);
check('uptrend picked, downtrend not', picks.length === 1 && picks[0].symbol === 'UP', picks.map((p) => [p.symbol, p.setup]));
check('levels are ordered stop < zone < TP1 < TP2', !!picks[0] && picks[0].levels.stop < picks[0].levels.entryLow && picks[0].levels.entryHigh < picks[0].levels.tp1 && picks[0].levels.tp1 < picks[0].levels.tp2);
check('thinly traded stocks are never picked', choosePicks([{ symbol: 'UP', candles: up.map((b) => ({ ...b, v: 100 })) }], day).length === 0);
const many = Array.from({ length: 25 }, (_, k) => ({ symbol: 'S' + k, candles: k < 10 ? up : down }));
check('breadth = share of liquid stocks above their 200-day average', near(breadthOf(many, day), 10 / 25));

const p: Pick = { symbol: 'X', setup: 'momentum', day: '2026-01-05', close: 100, levels: L, score: 8, liquidity: 1e7 };
const after = [bar(0, 1, 1, 1, 1), bar(1, 101, 101, 99, 100), bar(2, 100, 116, 99, 115)];
const sp = scorePick(p, after);
check('scoring ignores bars on or before the pick day', sp.filled === true && sp.result === 'tp2' && sp.closedDay === '2026-01-07', sp);
check('a pick not yet in its buy zone is not marked bought', scorePick(p, [bar(1, 103, 104, 102, 103)]).filled === false);
const done: ScoredPick[] = [sp, { ...p, result: 'stop', ret: -0.06, closedDay: '2026-01-06' }, { ...p, result: 'no-fill', ret: null, closedDay: '2026-01-08' }, { ...p, weak: true, result: 'stop', ret: -0.05, closedDay: '2026-01-06' }];
const st = statsOf(done, '2026-01-01');
check('scorecard counts strong-market picks only', st.picks === 3 && st.bought === 2 && st.won === 1 && near(st.avgRet, ((sp.ret as number) - 0.06) / 2), st);
check('weak-market picks are counted separately', statsOf(done, '2026-01-01', true).picks === 1);
const txt = pickText(p);
check('share text has zone, targets, stop and the tested record', /Buy zone: Rs 98.00 – 100.00/.test(txt) && /TP2: Rs 115.00/.test(txt) && /SL: Rs 94.00/.test(txt) && /Tested:/.test(txt), txt);
const nd = [
  JSON.stringify({ event: 'open' }),
  JSON.stringify({ event: 'message', message: JSON.stringify({ v: 1, picks: [], generatedAt: '2026-01-05T12:00:00Z', day: '2026-01-05' }) }),
  JSON.stringify({ event: 'message', message: JSON.stringify({ v: 1, picks: [], generatedAt: '2026-01-06T03:00:00Z', day: '2026-01-05' }) }),
  'garbage',
].join('\n');
check('feed reader takes the newest message and skips noise', parseFeed(nd)?.generatedAt === '2026-01-06T03:00:00Z');
check('no messages: no feed', parseFeed('') === null);
const lists = parseFeeds([
  JSON.stringify({ event: 'message', message: JSON.stringify({ v: 1, picks: [], generatedAt: '2026-01-06T03:00:00Z', day: '2026-01-05' }) }),
  JSON.stringify({ event: 'message', message: JSON.stringify({ v: 1, list: 'kse100', picks: [{ symbol: 'A' }], generatedAt: '2026-01-06T03:00:01Z', day: '2026-01-05' }) }),
  JSON.stringify({ event: 'message', message: JSON.stringify({ v: 1, list: 'kmi30', picks: [], generatedAt: '2026-01-06T03:00:02Z', day: '2026-01-05' }) }),
].join('\n'));
check('one feed per list; older feeds count as all shares', !!lists.all && lists.kse100?.picks.length === 1 && !!lists.kmi30);

// Pakistan time = UTC+5. Fri 16 Oct 2026 18:00 PKT = 13:00 UTC.
check('after 17:30 on a weekday, today\'s close is expected', expectedDay(Date.UTC(2026, 9, 16, 13)) === '2026-10-16');
check('before 17:30, the previous trading day', expectedDay(Date.UTC(2026, 9, 16, 6)) === '2026-10-15');
check('on Sunday, Friday', expectedDay(Date.UTC(2026, 9, 18, 6)) === '2026-10-16');
check('Monday morning, Friday', expectedDay(Date.UTC(2026, 9, 19, 4)) === '2026-10-16');
check('up to date: no warning', freshness({ day: '2026-10-16' }, Date.UTC(2026, 9, 18, 6)) === null);
check('behind: a warning', /hasn't arrived/.test(freshness({ day: '2026-10-15' }, Date.UTC(2026, 9, 16, 13)) ?? ''));
check('blocked run: a warning', /blocked/.test(freshness({ day: '2026-10-16', stale: true }, Date.UTC(2026, 9, 16, 13)) ?? ''));

if (failed) {
  console.log(`\n${failed} picks check(s) failed`);
  process.exit(1);
}
console.log('\nall picks checks passed');
