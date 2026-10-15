/**
 * Market-wide backtest of Sahm's technical rules.
 *   tsx scripts/backtest-study.ts <history dir from fetch-history.ts>
 *
 * For every stock-day: each rule's vote (as of that day only) and the forward
 * return after 5/10/20 trading days. Then:
 *  - how the current score's bullish / neutral / bearish days did vs all days
 *  - each rule on its own
 *  - alternative weightings, chosen on 2017-2021 and checked on 2022 onwards
 * Days with no trading are skipped; returns are clipped at ±40% to blunt bad ticks.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Candle } from '../src/psx/types';
import { computeSeries, rulesAt, stanceFor } from '../src/analysis/signals';

const dir = process.argv[2] ?? 'history';
const IDS = ['trend200', 'cross', 'trend20', 'macd', 'rsi', 'bb', 'volume', 'obv'] as const;
type Id = (typeof IDS)[number];
const SPLIT = Date.UTC(2022, 0, 1);
const H = [5, 10, 20] as const;
const clip = (r: number) => Math.max(-0.4, Math.min(0.4, r));

interface Day { sym: string; t: number; votes: Int8Array; rsiExtreme: boolean; liquid: boolean; r: Float64Array; score: number }
const days: Day[] = [];
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
let stocks = 0;
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as number[][];
  const candles: Candle[] = raw.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));
  if (candles.length < 450) continue;
  const S = computeSeries(candles);
  const start = S.e200.findIndex((v) => v != null);
  if (start < 0) continue;
  stocks++;
  const sym = f.replace('.json', '');
  // Rolling 60-day median traded value, Rs, for a liquidity flag.
  const val = S.c.map((b) => b.v * b.c);
  for (let i = start; i + 20 < S.c.length; i++) {
    if (!S.c[i].v) continue;
    const { rules, score } = rulesAt(S, i);
    const votes = new Int8Array(IDS.length).fill(9);
    let rsiExtreme = false;
    for (const r of rules) {
      const k = IDS.indexOf(r.id as Id);
      votes[k] = r.vote;
      if (r.id === 'rsi' && r.weight === 1) rsiExtreme = true;
    }
    const w = val.slice(Math.max(0, i - 59), i + 1).sort((a, b) => a - b);
    const liquid = w[w.length >> 1] >= 5e6;
    const r = new Float64Array(H.length);
    H.forEach((h, j) => (r[j] = clip(S.cl[i + h] / S.cl[i] - 1)));
    days.push({ sym, t: S.c[i].t, votes, rsiExtreme, liquid, r, score });
  }
}
console.log(`${stocks} stocks, ${days.length} stock-days (${days.filter((d) => d.liquid).length} liquid)`);

const pc = (x: number) => (x * 100).toFixed(2).padStart(6) + '%';
function stats(ds: Day[], j = 1) {
  if (!ds.length) return { n: 0, avg: 0, up: 0 };
  let s = 0, u = 0;
  for (const d of ds) { s += d.r[j]; if (d.r[j] > 0) u++; }
  return { n: ds.length, avg: s / ds.length, up: u / ds.length };
}
const line = (label: string, ds: Day[], base: Day[]) => {
  const b = stats(base);
  const parts = H.map((h, j) => { const s = stats(ds, j); const bb = stats(base, j); return `${h}d ${pc(s.avg)} (${(s.up * 100).toFixed(0)}% up, base ${pc(bb.avg)})`; });
  console.log(label.padEnd(26), String(ds.length).padStart(7), parts.join(' | '), b.n ? '' : '');
};
const grp = (score: number) => { const s = stanceFor(score); return s.includes('ullish') ? 'bullish' : s.includes('earish') ? 'bearish' : 'neutral'; };

for (const [name, set] of [['ALL', days], ['LIQUID (Rs 5M+/day)', days.filter((d) => d.liquid)]] as const) {
  for (const [period, ds] of [['2017-21', set.filter((d) => d.t < SPLIT)], ['2022+', set.filter((d) => d.t >= SPLIT)]] as const) {
    console.log(`\n== Current score, ${name}, ${period}`);
    line('all days', ds, ds);
    for (const g of ['bullish', 'neutral', 'bearish']) line(g, ds.filter((d) => grp(d.score) === g), ds);
    for (const st of ['Strong bullish', 'Bullish', 'Neutral', 'Bearish', 'Strong bearish']) line('  ' + st, ds.filter((d) => stanceFor(d.score) === st), ds);
  }
}

console.log('\n== Each rule alone (10-day, liquid). Edge = avg when bullish minus avg when bearish');
const liquid = days.filter((d) => d.liquid);
for (const [period, ds] of [['2017-21', liquid.filter((d) => d.t < SPLIT)], ['2022+', liquid.filter((d) => d.t >= SPLIT)]] as const) {
  console.log(`-- ${period}`);
  IDS.forEach((id, k) => {
    const bull = stats(ds.filter((d) => d.votes[k] === 1));
    const bear = stats(ds.filter((d) => d.votes[k] === -1));
    console.log(id.padEnd(10), `bull ${String(bull.n).padStart(7)} ${pc(bull.avg)} ${(bull.up * 100).toFixed(1)}% up | bear ${String(bear.n).padStart(7)} ${pc(bear.avg)} ${(bear.up * 100).toFixed(1)}% up | edge ${pc(bull.avg - bear.avg)}`);
  });
  const ex = stats(ds.filter((d) => d.rsiExtreme && d.votes[4] === 1)), ob = stats(ds.filter((d) => d.rsiExtreme && d.votes[4] === -1));
  console.log('rsi<30', `${ex.n} ${pc(ex.avg)}`, '| rsi>70', `${ob.n} ${pc(ob.avg)}`);
}

// Alternative weightings. Weight per rule; rsi gets its weight doubled when extreme (as now); negative = flip the vote.
type W = Record<Id, number>;
const CURRENT: W = { trend200: 2, cross: 1.5, trend20: 1, macd: 1, rsi: 0.5, bb: 0.5, volume: 0.5, obv: 0.5 };
const VARIANTS: Record<string, W> = {
  current: CURRENT,
  'no macd': { ...CURRENT, macd: 0 },
  'no bb': { ...CURRENT, bb: 0 },
  'bb flipped': { ...CURRENT, bb: -0.5 },
  'no macd, no bb': { ...CURRENT, macd: 0, bb: 0 },
  'no macd, bb flipped': { ...CURRENT, macd: 0, bb: -0.5 },
  'trend only': { trend200: 2, cross: 1.5, trend20: 1, macd: 0, rsi: 0, bb: 0, volume: 0, obv: 0 },
  'trend + volume': { trend200: 2, cross: 1.5, trend20: 1, macd: 0, rsi: 0, bb: 0, volume: 0.5, obv: 0.5 },
  'heavier short trend': { ...CURRENT, trend20: 2 },
  'no rsi': { ...CURRENT, rsi: 0 },
};
function scoreWith(d: Day, w: W) {
  let net = 0, tot = 0;
  IDS.forEach((id, k) => {
    const v = d.votes[k];
    if (v === 9 || !w[id]) return;
    const wt = Math.abs(w[id]) * (id === 'rsi' && d.rsiExtreme ? 2 : 1);
    tot += wt;
    net += wt * v * Math.sign(w[id]);
  });
  return tot ? Math.round((5 + (5 * net) / tot) * 10) / 10 : 5;
}
console.log('\n== Weightings (10-day, liquid). spread = bullish avg − bearish avg; lift = bullish avg − all-days avg');
console.log('variant'.padEnd(22), 'period ', 'bull days', ' bull avg', ' bear avg', '  spread', '    lift', ' bull up%', ' bear down%');
for (const [name, w] of Object.entries(VARIANTS)) {
  for (const [period, ds] of [['17-21', liquid.filter((d) => d.t < SPLIT)], ['22+  ', liquid.filter((d) => d.t >= SPLIT)]] as const) {
    const all = stats(ds);
    const bull = ds.filter((d) => grp(scoreWith(d, w)) === 'bullish');
    const bear = ds.filter((d) => grp(scoreWith(d, w)) === 'bearish');
    const b = stats(bull), r = stats(bear);
    console.log(name.padEnd(22), period, String(b.n).padStart(9), pc(b.avg), pc(r.avg), pc(b.avg - r.avg), pc(b.avg - all.avg), ((b.up * 100).toFixed(1) + '%').padStart(9), (((1 - r.up) * 100).toFixed(1) + '%').padStart(10));
  }
}

// How many stocks individually show the current score working (bullish avg > all-days avg, 10d)?
const bySym = new Map<string, Day[]>();
for (const d of liquid) (bySym.get(d.sym) ?? bySym.set(d.sym, []).get(d.sym)!).push(d);
let worked = 0, counted = 0;
for (const ds of bySym.values()) {
  const bull = ds.filter((d) => grp(d.score) === 'bullish');
  if (bull.length < 40 || ds.length < 250) continue;
  counted++;
  if (stats(bull).avg > stats(ds).avg) worked++;
}
console.log(`\nStocks where bullish days beat the stock's average day: ${worked}/${counted}`);
