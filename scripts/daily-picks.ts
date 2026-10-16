/**
 * The daily picks job (GitHub Actions, after the close and again before the open).
 *   tsx scripts/daily-picks.ts <state dir> [history dir to seed from]
 *
 * State (kept on the picks branch): cache/ with each stock's saved daily
 * history, picks.json with every pick ever made and how it played out, and
 * latest.json, the feed the app shows. The feed is also published to Sahm's
 * ntfy channel, which is where the app reads it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KeyValueStore, readEntry, setStorage, writeEntry } from '../src/psx/cache';
import { dailyCandles } from '../src/psx/history';
import type { Candle } from '../src/psx/types';
import { computeSeries } from '../src/analysis/signals';
import { liquidityAt } from '../src/analysis/picks';
import { breadthOf, choosePicks, PicksFeed, pkDay, RULES, ScoredPick, scorePick, statsOf, Universe } from '../src/picks/build';
import { WAIT_DAYS } from '../src/analysis/picks';
import { FEED_TOPIC, NTFY } from '../src/picks/config';

const [stateDir, historyDir] = process.argv.slice(2);
const cacheDir = join(stateDir, 'cache');
mkdirSync(cacheDir, { recursive: true });
const file = (key: string) => join(cacheDir, encodeURIComponent(key).replace(/%/g, '_') + '.json');
const fileStore: KeyValueStore = {
  get: async (k) => (existsSync(file(k)) ? readFileSync(file(k), 'utf8') : null),
  set: async (k, v) => writeFileSync(file(k), v),
};
setStorage(fileStore);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;
interface Saved { fullAt: number; bars: number[][] }
const toCandles = (rows: number[][]): Candle[] => rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));

async function main() {
  const now = Date.now();
  // 1. Symbols: everything saved, seeded from the price-history branch the first time.
  const symbols = new Set<string>(readdirSync(cacheDir).filter((f) => f.startsWith('daily_3A')).map((f) => decodeURIComponent(f.replace(/_/g, '%').replace(/\.json$/, '')).slice(6)));
  if (historyDir && existsSync(historyDir)) {
    for (const f of readdirSync(historyDir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
      const sym = f.replace('.json', '');
      if (symbols.has(sym)) continue;
      const bars = JSON.parse(readFileSync(join(historyDir, f), 'utf8')) as number[][];
      await writeEntry<Saved>(`daily:${sym}`, { fullAt: now - 6 * DAY, bars }, true, 0);
      symbols.add(sym);
    }
  }
  console.log(`${symbols.size} stocks saved`);

  const historyPath = join(stateDir, 'picks.json');
  const history: ScoredPick[] = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : [];
  const openSymbols = new Set(history.filter((p) => p.result === 'open').map((p) => p.symbol));

  // 2. Bring liquid stocks (and any with an open pick) up to date. Once a week, everything,
  //    so stocks that became liquid are noticed.
  const scanAll = new Date(now).getUTCDay() === 1 || process.env.SCAN_ALL === '1';
  const refresh: string[] = [];
  for (const sym of symbols) {
    const e = await readEntry<Saved>(`daily:${sym}`, true);
    if (!e) continue;
    const c = toCandles(e.data.bars);
    const S = computeSeries(c);
    const liquid = S.c.length > 60 && liquidityAt(S, S.c.length - 1) >= 2_000_000;
    if (scanAll || liquid || openSymbols.has(sym)) refresh.push(sym);
  }
  console.log(`refreshing ${refresh.length} stocks${scanAll ? ' (weekly full scan)' : ''}`);
  const universe: Universe[] = [];
  let failed = 0;
  for (const sym of refresh) {
    try {
      const candles = await dailyCandles(sym);
      universe.push({ symbol: sym, candles, series: computeSeries(candles) });
    } catch (e) {
      failed++;
      console.log(`${sym}: ${(e as Error).message}`);
    }
    await sleep(300);
  }
  // The latest trading day = the most common last-bar day among liquid stocks.
  const counts = new Map<string, number>();
  for (const u of universe) {
    const d = pkDay(u.candles[u.candles.length - 1].t);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const day = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  if (!day) throw new Error('no price data');
  console.log(`latest trading day ${day}; ${failed} failed`);

  // 3. Score earlier picks.
  const bySymbol = new Map(universe.map((u) => [u.symbol, u.candles]));
  for (let k = 0; k < history.length; k++) {
    const p = history[k];
    if (p.result !== 'open') continue;
    const c = bySymbol.get(p.symbol);
    if (c) history[k] = scorePick(p, c);
  }

  // 4. Today's picks, once per trading day.
  const breadth = breadthOf(universe, day);
  const marketOk = breadth != null && breadth >= RULES.minBreadth;
  if (!history.some((p) => p.day === day)) {
    // In a weak market the same choices are kept as "watch only" and scored separately.
    const picks = choosePicks(universe, day).map((p) => (marketOk ? p : { ...p, weak: true }));
    for (const p of picks) history.push({ ...p, result: 'open', ret: null, closedDay: null });
    console.log(`breadth ${breadth == null ? 'n/a' : (breadth * 100).toFixed(0) + '%'}${marketOk ? '' : ' (weak: watch only)'}: ${picks.map((p) => p.symbol).join(', ') || 'none'}`);
  }
  writeFileSync(historyPath, JSON.stringify(history));

  // 5. The feed.
  const closed = history.filter((p) => p.result !== 'open').sort((a, b) => ((b.closedDay ?? b.day) < (a.closedDay ?? a.day) ? -1 : 1));
  const since = pkDay(Date.parse(day + 'T12:00:00Z') - 90 * DAY);
  const feed: PicksFeed = {
    v: 1,
    day,
    generatedAt: new Date(now).toISOString(),
    breadth,
    marketOk,
    picks: history.filter((p) => p.day === day),
    // Earlier picks still running; an unbought one is dropped when the stock is picked again today.
    open: history.filter((p) => p.result === 'open' && p.day < day && (p.filled || !history.some((q) => q.day === day && q.symbol === p.symbol))),
    recent: closed.slice(0, 12),
    stats: statsOf(closed, since),
    weakStats: statsOf(closed, since, true),
    rules: { hold: RULES.hold, wait: WAIT_DAYS },
  };
  // ntfy keeps messages up to 4 KB as text; trim the oldest results if needed.
  let body = JSON.stringify(feed);
  while (body.length > 3900 && feed.recent.length) {
    feed.recent.pop();
    body = JSON.stringify(feed);
  }
  writeFileSync(join(stateDir, 'latest.json'), body);
  if (process.env.PUBLISH === '1') {
    const res = await fetch(`${NTFY}/${FEED_TOPIC}`, { method: 'POST', body, headers: { Title: `Sahm picks ${day}` } });
    console.log(`published to ntfy: ${res.status}`);
    if (!res.ok) process.exitCode = 1;
  }
  console.log(body);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
