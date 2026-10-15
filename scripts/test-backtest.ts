import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseHistorical, parseTimeseries } from '../src/psx/parse';
import { analyze, computeSeries, rulesAt } from '../src/analysis/signals';
import { backtest, COST, groupOf, trackRecord } from '../src/analysis/backtest';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');
const luck = adjustCandles(parseHistorical(f('historical_LUCK.html')), parseTimeseries(JSON.parse(f('eod_LUCK.json'))));

// No look-ahead: the score the backtest uses for a past day equals what the app showed with history cut at that day.
const S = computeSeries(luck);
let same = 0;
const days = [250, 600, 1200, 1800, 2300, luck.length - 1];
for (const i of days) {
  const past = analyze(luck.slice(0, i + 1));
  if (past && past.score === rulesAt(S, i).score) same++;
}
check('no look-ahead: past scores match a truncated history', same === days.length, `${same}/${days.length}`);
check('latest day matches analyze()', analyze(luck)!.score === rulesAt(S, luck.length - 1).score);

const t0 = Date.now();
const bt = backtest(luck, S)!;
const ms = Date.now() - t0;
check('backtest runs on 10 years in under 2 s', !!bt && ms < 2000, `${ms} ms`);
const total = bt.groups.bullish[10].days + bt.groups.neutral[10].days + bt.groups.bearish[10].days;
check('every tested day lands in exactly one group', total === bt.base[10].days, [total, bt.base[10].days]);
check('outcomes are fractions', Object.values(bt.base).every((o) => o.up >= 0 && o.up <= 1 && Math.abs(o.avg) < 1));
check('calls counted', bt.calls.bullish.events > 5 && bt.calls.bearish.events > 5, bt.calls);
check('all 8 rules have stats', bt.rules.length === 8, bt.rules.map((r) => r.id));

// Base rate check by hand for the 10-day horizon.
const cl = S.cl;
const start = S.e200.findIndex((v) => v != null);
let n = 0, up = 0;
for (let i = start; i + 10 <= cl.length - 1; i++) { n++; if (cl[i + 10] > cl[i]) up++; }
check('base 10-day up-rate matches a direct count', bt.base[10].days === n && Math.abs(bt.base[10].up - up / n) < 1e-12, [bt.base[10].up, up / n]);

// A market that trends in long waves: trend rules should beat the base, and the record should say so.
const waves = Array.from({ length: 1400 }, (_, i) => {
  const c = 200 * Math.exp(0.25 * Math.sin(i / 80) + 0.0002 * i) * (1 + 0.004 * Math.sin(i * 1.7));
  return { t: Date.UTC(2020, 0, 1) + i * 864e5, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e5 };
});
const bw = backtest(waves)!;
check('in trending data, bullish days beat the average day', bw.groups.bullish[10].avg > bw.base[10].avg, [bw.groups.bullish[10].avg, bw.base[10].avg]);
const tr = trackRecord(bw, 'Bullish')!;
check('track record calls that an edge', tr.edge === 'better' && tr.rate > tr.baseRate, tr);
check('bearish track record measures falls', trackRecord(bw, 'Bearish')!.rate === 1 - bw.groups.bearish[10].up);
check('groups map stances', groupOf('Strong bullish') === 'bullish' && groupOf('Neutral') === 'neutral' && groupOf('Bearish') === 'bearish');
check('too little history gives no backtest', backtest(luck.slice(-300)) === null);
check('costs are applied to bullish calls', COST === 0.003);

if (process.env.SHOW) {
  const pc = (x: number) => (x * 100).toFixed(1) + '%';
  console.log('\nLUCK', new Date(bt.from).toISOString().slice(0, 10), '→', new Date(bt.to).toISOString().slice(0, 10));
  for (const g of ['bullish', 'neutral', 'bearish'] as const) console.log(g.padEnd(8), [5, 10, 20].map((h) => `${h}d: ${bt.groups[g][h as 5].days}d up ${pc(bt.groups[g][h as 5].up)} avg ${pc(bt.groups[g][h as 5].avg)}`).join(' | '));
  console.log('base    ', [5, 10, 20].map((h) => `${h}d: up ${pc(bt.base[h as 5].up)} avg ${pc(bt.base[h as 5].avg)}`).join(' | '));
  console.log('calls', JSON.stringify(bt.calls));
  for (const r of bt.rules) console.log(r.id.padEnd(9), `bull ${r.bull.days}d avg ${pc(r.bull.avg)} up ${pc(r.bull.up)} | bear ${r.bear.days}d avg ${pc(r.bear.avg)} up ${pc(r.bear.up)}`);
  console.log(trackRecord(bt, analyze(luck)!.stance));
}
if (failed) {
  console.log(`\n${failed} backtest check(s) failed`);
  process.exit(1);
}
console.log('\nall backtest checks passed');
