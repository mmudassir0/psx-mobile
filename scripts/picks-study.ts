/**
 * Backtest of daily picks: every liquid stock-day with a setup becomes a pick
 * with a buy zone, stop and targets, played forward with playOut. Compared with
 * the same levels on every liquid day (no setup), to see whether the setup adds
 * anything. 2017-21 to choose, 2022+ to check.
 *   tsx scripts/picks-study.ts <history dir>
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Candle } from '../src/psx/types';
import { computeSeries } from '../src/analysis/signals';
import { levelsAt, liquidityAt, MIN_LIQUIDITY, Outcome, playOut, setupsAt, SetupId, WAIT_DAYS } from '../src/analysis/picks';

const dir = process.argv[2];
const SPLIT = Date.UTC(2022, 0, 1);
const K = { zone: Number(process.env.ZONE ?? 0.5), stop: Number(process.env.STOP ?? 1), tp1: Number(process.env.TP1 ?? 1), tp2: Number(process.env.TP2 ?? 2) };
const HOLD = Number(process.env.HOLD ?? 10);
const ONLY = process.env.ONLY === '1';
console.log('levels', JSON.stringify(K), 'hold', HOLD);
interface P { sym: string; t: number; setup: SetupId | 'any-day'; strength: number; o: Outcome }
const picks: P[] = [];
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const load = (f: string): Candle[] => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as number[][]).map(([t, o, h, l, cl, v]) => ({ t, o, h, l, c: cl, v }));
// Market breadth: share of liquid stocks closing above their 200-day average, per day.
const up = new Map<number, number>(), all = new Map<number, number>();
for (const f of files) {
  const c = load(f);
  if (c.length < 450) continue;
  const S = computeSeries(c);
  for (let i = 60; i < S.c.length; i++) {
    const e = S.e200[i];
    if (e == null || !S.c[i].v || liquidityAt(S, i) < MIN_LIQUIDITY) continue;
    const t = S.c[i].t;
    all.set(t, (all.get(t) ?? 0) + 1);
    if (S.cl[i] > e) up.set(t, (up.get(t) ?? 0) + 1);
  }
}
const breadth = (t: number) => ((all.get(t) ?? 0) >= 20 ? (up.get(t) ?? 0) / all.get(t)! : null);
const MIN_BREADTH = Number(process.env.BREADTH ?? 0);
for (const f of files) {
  const c = load(f);
  if (c.length < 450) continue;
  const S = computeSeries(c);
  const start = S.e200.findIndex((v) => v != null);
  if (start < 0) continue;
  const sym = f.replace('.json', '');
  for (let i = Math.max(start, 60); i + 1 < S.c.length; i++) {
    if (!S.c[i].v || liquidityAt(S, i) < MIN_LIQUIDITY) continue;
    if (MIN_BREADTH && (breadth(S.c[i].t) ?? 0) < MIN_BREADTH) continue;
    const L = levelsAt(S, i, K);
    if (!L) continue;
    const after = S.c.slice(i + 1, i + 2 + WAIT_DAYS + HOLD);
    const o = playOut(after, L, WAIT_DAYS, HOLD);
    if (o.result === 'open') continue;
    if (i % 5 === 0) picks.push({ sym, t: S.c[i].t, setup: 'any-day', strength: 0, o });
    for (const s of setupsAt(S, i)) picks.push({ sym, t: S.c[i].t, setup: s.id, strength: s.strength, o });
  }
}

const pc = (x: number) => (x * 100).toFixed(2).padStart(6) + '%';
function report(label: string, ps: P[]) {
  const filled = ps.filter((p) => p.o.ret != null);
  if (!filled.length) return console.log(label.padEnd(30), 'none');
  const ret = filled.map((p) => p.o.ret!);
  const avg = ret.reduce((a, b) => a + b, 0) / ret.length;
  const r = filled.map((p) => p.o.r ?? 0);
  const count = (k: Outcome['result']) => filled.filter((p) => p.o.result === k).length / filled.length;
  console.log(
    label.padEnd(30),
    String(ps.length).padStart(7),
    'filled', pc(filled.length / ps.length),
    '| won', pc(ret.filter((x) => x > 0).length / ret.length),
    'avg', pc(avg),
    'avgR', (r.reduce((a, b) => a + b, 0) / r.length).toFixed(2).padStart(5),
    '| TP1', pc(filled.filter((p) => p.o.hitTp1).length / filled.length),
    'TP2', pc(count('tp2')),
    'stop', pc(count('stop')),
    'time', pc(count('time') + count('tp1-then-time')),
  );
}
for (const [period, f] of [['2017-21', (p: P) => p.t < SPLIT], ['2022+', (p: P) => p.t >= SPLIT]] as const) {
  console.log(`\n== ${period}`);
  for (const s of ['any-day', 'pullback', 'breakout', 'momentum'] as const) report(s, picks.filter((p) => p.setup === s && f(p)));
  // What the daily message would contain: the 5 strongest signals of one setup per day.
  for (const s of ['pullback', 'breakout', 'momentum'] as const) {
    const byDay = new Map<number, P[]>();
    for (const p of picks) if (p.setup === s && f(p)) (byDay.get(p.t) ?? byDay.set(p.t, []).get(p.t)!).push(p);
    const top = [...byDay.values()].flatMap((ps) => ps.sort((a, b) => b.strength - a.strength).slice(0, 5));
    report(`  top 5/day ${s}`, top);
  }
}
