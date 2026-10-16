import { indexTrend, rawRegime, regimes, trendTriggers } from '../src/analysis/market';
import { beta, drawdowns, inEpisode, stressTest } from '../src/portfolio/stress';
import type { Candle, SeriesPoint } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const D0 = Date.UTC(2020, 0, 1) - 5 * 3600e3;
const pts = (f: (i: number) => number, n = 400): SeriesPoint[] => Array.from({ length: n }, (_, i) => ({ t: D0 + i * 864e5, v: f(i), vol: 1e8 }));

check('raw: up / down / sideways', rawRegime(110, 105, 100, 0.02) === 'Uptrend' && rawRegime(90, 95, 100, -0.02) === 'Downtrend' && rawRegime(101, 100, 100, 0.0) === 'Sideways');
const up = indexTrend(pts((i) => 50000 * Math.exp(0.002 * i)))!;
check('steady rise is an uptrend', up.regime === 'Uptrend' && up.returns.m1! > 0 && Math.abs(up.fromHigh) < 1e-9, up);
const down = indexTrend(pts((i) => 80000 * Math.exp(-0.0015 * i)))!;
check('steady fall is a downtrend', down.regime === 'Downtrend' && down.returns.m1! < 0, down.regime);
const flat = indexTrend(pts((i) => 60000 * (1 + 0.03 * Math.sin(i / 9))))!;
check('back and forth is sideways, with its range', flat.regime === 'Sideways' && flat.rangeHigh > flat.rangeLow, [flat.regime, flat.rangeLow, flat.rangeHigh]);
// Rise for 300 days then fall: the downtrend is dated from when the fall took over.
const turn = pts((i) => (i < 300 ? 50000 * Math.exp(0.002 * i) : 50000 * Math.exp(0.6) * Math.exp(-0.006 * (i - 300))), 420);
const tt = indexTrend(turn)!;
check('a turn is dated and counted', tt.regime === 'Downtrend' && tt.days > 5 && tt.days < 120 && tt.since > turn[300].t, [tt.days, new Date(tt.since).toISOString().slice(0, 10)]);
check('no flicker: one bad day does not flip an uptrend', (() => { const s = pts((i) => 50000 * Math.exp(0.002 * i)).map((p) => p.v); s[s.length - 2] *= 0.9; const r = regimes(s); return r[r.length - 2] === 'Uptrend'; })());
check('triggers in words', /50-day/.test(trendTriggers(tt).up) && /range top/.test(trendTriggers(flat).up));
check('too little history: no trend', indexTrend(pts((i) => 100 + i, 100)) === null);

// A 40% fall and recovery, then a 10% dip (ignored).
const crash = pts((i) => (i < 100 ? 100 : i < 150 ? 100 - (i - 100) * 0.8 : i < 250 ? 60 + (i - 150) * 0.5 : i < 260 ? 110 - (i - 250) : 100 + (i - 260)), 400);
const ep = drawdowns(crash);
check('finds the big fall only', ep.length === 1 && Math.abs(ep[0].fall + 0.4) < 0.01 && ep[0].recoveredT != null, ep);
const asCandles = (p: SeriesPoint[], k = 1): Candle[] => p.map((x) => ({ t: x.t, o: x.v * k, h: x.v * k, l: x.v * k, c: x.v * k, v: 1 }));
const r = inEpisode(asCandles(crash, 3), ep[0])!;
check('a holding through that fall: same % change, recovery counted', Math.abs(r.change + 0.4) < 0.01 && r.recoveryDays! > 50, r);
// Stock moving twice the index each day.
const ix = pts((i) => 100 * (1 + 0.01 * Math.sin(i * 1.3)) * Math.exp(0.0005 * i), 600);
const lev: Candle[] = [{ t: ix[0].t, o: 100, h: 100, l: 100, c: 100, v: 1 }];
for (let i = 1; i < ix.length; i++) { const c = lev[i - 1].c * (1 + 2 * (ix[i].v / ix[i - 1].v - 1)); lev.push({ t: ix[i].t, o: c, h: c, l: c, c, v: 1 }); }
const b = beta(lev, ix)!;
check('beta of a stock that moves 2× the index is 2', Math.abs(b - 2) < 0.01, b);
const st = stressTest([{ symbol: 'A', value: 300, candles: lev }, { symbol: 'B', value: 100, candles: asCandles(ix) }, { symbol: 'C', value: 100, candles: null }], ix);
check('portfolio beta is value-weighted over holdings with data', Math.abs(st.beta! - (2 * 300 + 1 * 100) / 400) < 0.02 && Math.abs(st.coverage - 0.8) < 1e-9, st.beta);

if (failed) {
  console.log(`\n${failed} market check(s) failed`);
  process.exit(1);
}
console.log('\nall market checks passed');
