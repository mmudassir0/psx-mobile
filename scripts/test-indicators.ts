/**
 * Indicator and signal tests.
 * Golden values for LUCK were cross-checked against an independent pandas
 * implementation (ewm adjust=False, Wilder smoothing alpha=1/14).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseHistorical, parseTimeseries } from '../src/psx/parse';
import type { Candle } from '../src/psx/types';
import { atr, bollinger, cci, closes, ema, last, macd, obv, rsi, sma, stochastic, williamsR } from '../src/analysis/indicators';
import { findLevels, pivots } from '../src/analysis/levels';
import { technicals } from '../src/analysis/technicals';
import { analyze, stanceFor, MIN_BARS } from '../src/analysis/signals';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number | null, b: number, tol = 1e-3) => a != null && Math.abs(a - b) < tol;
const bar = (t: number, c: number, v = 1000, spread = 1): Candle => ({ t, o: c, h: c + spread, l: c - spread, c, v });

// --- small hand-checked cases ---
const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
check('sma warm-up is null', sma(ten, 3)[1] === null);
check('sma(3) of 1..10 ends at 9', sma(ten, 3)[9] === 9);
check('ema of a constant is the constant', near(last(ema(new Array(50).fill(7), 10)), 7));
check('ema seeded with sma', near(ema(ten, 3)[2], 2));
check('rsi of a steady rise is 100', rsi(Array.from({ length: 30 }, (_, i) => i + 1))[29] === 100);
check('rsi of a steady fall is 0', near(rsi(Array.from({ length: 30 }, (_, i) => 100 - i))[29], 0));
check('rsi of a flat line is 50', rsi(new Array(30).fill(5))[29] === 50);
const flat = Array.from({ length: 40 }, (_, i) => bar(i, 100, 1000, 2));
check('atr of fixed 4-point range is 4', near(last(atr(flat)), 4));
check('bollinger collapses on a flat line', near(last(bollinger(new Array(25).fill(9)).upper), 9));
check('obv adds on up days, subtracts on down', obv([bar(0, 10), bar(1, 11, 500), bar(2, 9, 200)])[2] === 300);

// --- golden values on 10 years of LUCK ---
const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');
const luck = adjustCandles(parseHistorical(f('historical_LUCK.html')), parseTimeseries(JSON.parse(f('eod_LUCK.json'))));
const cl = closes(luck);
check('LUCK ema20', near(last(ema(cl, 20)), 413.952859), last(ema(cl, 20)));
check('LUCK ema200', near(last(ema(cl, 200)), 427.490082), last(ema(cl, 200)));
check('LUCK rsi14', near(last(rsi(cl)), 37.520448), last(rsi(cl)));
const m = macd(cl);
check('LUCK macd', near(last(m.macd), -5.595146) && near(last(m.signal), -5.653524), [last(m.macd), last(m.signal)]);
check('LUCK atr14', near(last(atr(luck)), 8.277023), last(atr(luck)));
check('LUCK bollinger upper', near(last(bollinger(cl).upper), 423.853163), last(bollinger(cl).upper));

const st = stochastic(luck);
check('LUCK stochastic %K/%D', near(last(st.k), 7.939697) && near(last(st.d), 16.574856), [last(st.k), last(st.d)]);
check('LUCK williams %R', near(last(williamsR(luck)), -96.713229), last(williamsR(luck)));
check('LUCK CCI', near(last(cci(luck)), -107.999305), last(cci(luck)));
const pv = pivots({ h: 110, l: 90, c: 100 });
check('pivots', pv.pp === 100 && pv.r1 === 110 && pv.s1 === 90 && pv.r2 === 120 && pv.s2 === 80 && pv.r3 === 130 && pv.s3 === 70, pv);

// --- technicals summary ---
const tech = technicals(luck);
check('technicals returned', !!tech);
if (tech) {
  check('oscillators listed', tech.oscillators.map((o) => o.id).join() === 'rsi,stoch,macd,cci,wr', tech.oscillators.map((o) => o.id));
  check('12 moving averages', tech.averages.length === 12, tech.averages.length);
  check('MA action follows price', tech.averages.every((m) => m.value == null || m.action === (tech.price > m.value ? 'Buy' : 'Sell')));
  check('summary counts add up', tech.summary.buy + tech.summary.sell + tech.summary.neutral === tech.oscillators.length + tech.averages.length, tech.summary);
  check('stochastic oversold reads Buy', tech.oscillators.find((o) => o.id === 'stoch')?.action === 'Buy');
}

// --- levels ---
const lv = findLevels(luck);
check('support below price', !!lv.support && lv.support.price < cl[cl.length - 1], lv.support);
check('resistance above price', !!lv.resistance && lv.resistance.price > cl[cl.length - 1], lv.resistance);

// --- signals ---
const a = analyze(luck);
check('analysis returned', !!a);
if (a) {
  check('score within 0..10', a.score >= 0 && a.score <= 10, a.score);
  check('stance matches score', a.stance === stanceFor(a.score), a.stance);
  check('all 8 rules present with 10 years of data', a.rules.length === 8, a.rules.map((r) => r.id));
  check('every rule has a reason', a.rules.every((r) => r.reason.length > 5));
  check('stop below close', a.stop != null && a.stop < a.ind.close, a.stop);
  check('no NaN in indicators', Object.values(a.ind).every((v) => v == null || Number.isFinite(v)));
}
check('too little history returns null', analyze(luck.slice(0, MIN_BARS - 1)) === null);
const short = analyze(luck.slice(-120));
check('short history skips 200-day rules', !!short && !short.rules.some((r) => r.id === 'trend200' || r.id === 'cross'));
const rising = Array.from({ length: 260 }, (_, i) => bar(i, 100 + i + (i % 3), 1000 + i));
const up = analyze(rising);
check('steady uptrend scores bullish', !!up && up.score >= 6, up?.score);
const falling = Array.from({ length: 260 }, (_, i) => bar(i, 400 - i - (i % 3), 1000 + i));
const down = analyze(falling);
check('steady downtrend scores bearish', !!down && down.score <= 4, down?.score);

if (failed) {
  console.log(`\n${failed} indicator check(s) failed`);
  process.exit(1);
}
console.log('\nall indicator checks passed');
