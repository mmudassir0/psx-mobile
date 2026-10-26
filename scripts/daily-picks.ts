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
import { dailyCandles, lastSource } from '../src/psx/history';
import type { Candle } from '../src/psx/types';
import { computeSeries } from '../src/analysis/signals';
import { liquidityAt } from '../src/analysis/picks';
import {
  breadthOf,
  choosePicks,
  ListId,
  listOf,
  liveRecord,
  LISTS,
  PicksFeed,
  pkDay,
  RULES,
  ScoredPick,
  scorePick,
  statsOf,
  Universe,
} from '../src/picks/build';
import { buildMatcher, buildNews, NEWS_FEEDS, parseRss, type NewsFeed, type RawItem } from '../src/analysis/news';
import { fetchCompany, fetchIndexConstituents, fetchPayouts, fetchScreener, fetchSeries, fetchSymbols } from '../src/psx/api';
import { longTermList, monthReturn, LT, type LtFeed, type LtMonth } from '../src/analysis/longterm';
import { cashDividends, dividends } from '../src/analysis/dividends';
import { cached } from '../src/psx/cache';
import { indexTrend, MarketFeed } from '../src/analysis/market';
import { MIN_LIQUIDITY } from '../src/analysis/picks';
import { WAIT_DAYS } from '../src/analysis/picks';
import { FEED_TOPIC, NTFY } from '../src/picks/config';
import { moodHistory, moodLabel, moodOutcomes, MoodFeed } from '../src/analysis/mood';
import type { CalendarFeed, CalendarRow } from '../src/analysis/calendar';
import type { SeriesPoint } from '../src/psx/types';

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
interface Saved {
  fullAt: number;
  bars: number[][];
}
const toCandles = (rows: number[][]): Candle[] => rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));

/** Mon–Fri 09:00–16:30 Pakistan time: today's prices are still moving, so nothing is downloaded. */
function inSession(t: number) {
  const d = new Date(t + 5 * 3600_000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && m >= 9 * 60 && m < 16 * 60 + 30;
}

async function main() {
  const now = Date.now();
  // A late or manual start during trading would save a half-finished day as if it were the close.
  const session = inSession(now) && process.env.ALLOW_SESSION !== '1';
  if (session) console.log('market is trading: using saved closes only, no new price downloads');
  // 1. Symbols: everything saved, seeded from the price-history branch the first time.
  const symbols = new Set<string>(
    readdirSync(cacheDir)
      .filter((f) => f.startsWith('daily_3A'))
      .map((f) => decodeURIComponent(f.replace(/_/g, '%').replace(/\.json$/, '')).slice(6)),
  );
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

  // Index members, from PSX; the last good list if PSX doesn't answer.
  const membersPath = join(stateDir, 'indexes.json');
  const members: Record<string, string[]> = existsSync(membersPath) ? JSON.parse(readFileSync(membersPath, 'utf8')) : {};
  if (!members.KSE100 && historyDir && existsSync(join(historyDir, 'index.json')))
    members.KSE100 = JSON.parse(readFileSync(join(historyDir, 'index.json'), 'utf8')).sets?.KSE100 ?? [];
  for (const code of ['KSE100', 'KMI30']) {
    for (let a = 0; a < 4; a++) {
      try {
        const list = (await fetchIndexConstituents(code)).map((c) => c.symbol);
        if (list.length >= 20) members[code] = list;
        break;
      } catch {
        await sleep(4000 * (a + 1));
      }
    }
    console.log(`${code}: ${members[code]?.length ?? 0} members`);
  }
  writeFileSync(membersPath, JSON.stringify(members));
  const indexMembers = new Set([...(members.KSE100 ?? []), ...(members.KMI30 ?? [])]);

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
    if (scanAll || liquid || openSymbols.has(sym) || indexMembers.has(sym)) refresh.push(sym);
  }
  console.log(`refreshing ${refresh.length} stocks${scanAll ? ' (weekly full scan)' : ''}`);
  const universe: Universe[] = [];
  let failed = 0;
  let staleCount = 0;
  for (const sym of refresh) {
    try {
      const saved = session ? await readEntry<Saved>(`daily:${sym}`, true) : null;
      const candles = saved ? toCandles(saved.data.bars) : await dailyCandles(sym);
      if (!saved && lastSource === 'stale') staleCount++;
      if (!candles.length) continue;
      universe.push({ symbol: sym, candles, series: computeSeries(candles) });
    } catch (e) {
      failed++;
      console.log(`${sym}: ${(e as Error).message}`);
    }
    if (!session) await sleep(300);
  }
  // The latest trading day = the most common last-bar day among liquid stocks.
  const counts = new Map<string, number>();
  for (const u of universe) {
    const d = pkDay(u.candles[u.candles.length - 1].t);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const day = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  if (!day) throw new Error('no price data');
  // When PSX refuses most downloads, everything below is built on old prices: say so in the feed.
  const stale = staleCount + failed > refresh.length / 2;
  console.log(`latest trading day ${day}; ${failed} failed, ${staleCount} from saved copies${stale ? ' (STALE)' : ''}`);

  // 3. Score earlier picks.
  const bySymbol = new Map(universe.map((u) => [u.symbol, u.candles]));
  // Cash dividends of stocks with open picks, so a trade held over an ex-date gets its dividend.
  const screener = new Map(((await fetchScreener().catch(() => [])) ?? []).map((r) => [r.symbol, r] as const));
  const cashOf = new Map<string, { exT: number; dps: number }[]>();
  for (const sym of new Set(history.filter((p) => p.result === 'open').map((p) => p.symbol))) {
    const pay = await cached(`payouts:${sym}`, 20 * 3600_000, () => fetchPayouts(sym), { persist: true }).catch(() => null);
    const c = bySymbol.get(sym);
    if (pay && c?.length)
      cashOf.set(sym, cashDividends(dividends(pay, { price: c[c.length - 1].c, divYield: screener.get(sym)?.divYield ?? null, fiscalEndMonth: 11 })));
    await sleep(300);
  }
  for (let k = 0; k < history.length; k++) {
    const p = history[k];
    if (p.result !== 'open') continue;
    const c = bySymbol.get(p.symbol);
    if (c) history[k] = scorePick(p, c, cashOf.get(p.symbol) ?? []);
  }

  // 4. Today's picks for each list, once per trading day. The market check is market-wide.
  const breadth = breadthOf(universe, day);
  const marketOk = breadth != null && breadth >= RULES.minBreadth;
  const universeFor = (id: ListId) => {
    const idx = LISTS.find((l) => l.id === id)!.index;
    if (!idx) return universe;
    const m = new Set(members[idx] ?? []);
    return universe.filter((u) => m.has(u.symbol));
  };
  for (const L of LISTS) {
    if (history.some((p) => p.day === day && listOf(p) === L.id)) continue;
    // a stock that already has a pick in play isn't picked again (the same trade, counted twice)
    const busy = new Set(history.filter((p) => p.result === 'open' && listOf(p) === L.id).map((p) => p.symbol));
    const picks = choosePicks(
      universeFor(L.id).filter((u) => !busy.has(u.symbol)),
      day,
    ).map((p) => ({ ...p, list: L.id, ...(marketOk ? {} : { weak: true }) }));
    for (const p of picks) history.push({ ...p, result: 'open', ret: null, closedDay: null });
    console.log(`${L.label}: ${picks.map((p) => p.symbol).join(', ') || 'none'}`);
  }
  console.log(`breadth ${breadth == null ? 'n/a' : (breadth * 100).toFixed(0) + '%'}${marketOk ? '' : ' (weak: watch only)'}`);
  writeFileSync(historyPath, JSON.stringify(history));

  // 5. One feed message per list (each stays under ntfy's 4 KB text limit).
  const since = pkDay(Date.parse(day + 'T12:00:00Z') - 90 * DAY);
  const feeds: Record<string, PicksFeed> = {};
  for (const L of LISTS) {
    const mine = history.filter((p) => listOf(p) === L.id);
    const closed = mine.filter((p) => p.result !== 'open').sort((a, b) => ((b.closedDay ?? b.day) < (a.closedDay ?? a.day) ? -1 : 1));
    const feed: PicksFeed = {
      v: 1,
      list: L.id,
      day,
      generatedAt: new Date(now).toISOString(),
      breadth,
      marketOk,
      picks: mine.filter((p) => p.day === day),
      // Earlier picks still running; an unbought one is dropped when the stock is picked again today.
      open: mine.filter((p) => p.result === 'open' && p.day < day && (p.filled || !mine.some((q) => q.day === day && q.symbol === p.symbol))),
      recent: closed.slice(0, 12),
      stats: statsOf(closed, since),
      weakStats: statsOf(closed, since, true),
      rules: { hold: RULES.hold, wait: WAIT_DAYS },
      live: liveRecord(mine),
      ...(stale ? { stale: true } : {}),
    };
    let body = JSON.stringify(feed);
    while (body.length > 3900 && feed.recent.length) {
      feed.recent.pop();
      body = JSON.stringify(feed);
    }
    while (body.length > 3900 && feed.open.length) {
      feed.open.pop();
      body = JSON.stringify(feed);
    }
    feeds[L.id] = feed;
    if (process.env.PUBLISH === '1') {
      const res = await fetch(`${NTFY}/${FEED_TOPIC}`, { method: 'POST', body, headers: { Title: `Sahm picks ${L.label} ${day}` } });
      console.log(`published ${L.label} to ntfy: ${res.status}`);
      if (!res.ok) process.exitCode = 1;
    }
  }
  writeFileSync(join(stateDir, 'latest.json'), JSON.stringify(feeds));

  // 6. The market report: each index's trend and how every sector is doing.
  const retry = async <T>(f: () => Promise<T>): Promise<T | null> => {
    for (let a = 0; a < 4; a++) {
      try {
        return await f();
      } catch {
        await sleep(4000 * (a + 1));
      }
    }
    return null;
  };
  const sectorsPath = join(stateDir, 'sectors.json');
  let sectorOf: Record<string, string> = existsSync(sectorsPath) ? JSON.parse(readFileSync(sectorsPath, 'utf8')) : {};
  const syms = await retry(fetchSymbols);
  if (syms?.length) {
    sectorOf = Object.fromEntries(syms.map((x) => [x.symbol, x.sectorName]));
    writeFileSync(sectorsPath, JSON.stringify(sectorOf));
  }
  const indices: MarketFeed['indices'] = {};
  let kse: SeriesPoint[] | null = null;
  for (const code of ['KSE100', 'KMI30', 'ALLSHR']) {
    const today = pkDay(now);
    const pts = (await retry(() => fetchSeries('eod', code)))?.filter((p) => !session || pkDay(p.t) < today) ?? null;
    if (code === 'KSE100') kse = pts;
    const t = pts ? indexTrend(pts) : null;
    if (t)
      indices[code] = {
        regime: t.regime,
        since: t.since,
        days: t.days,
        close: Math.round(t.close),
        r1m: t.returns.m1 == null ? null : Math.round(t.returns.m1 * 1000) / 1000,
        fromHigh: Math.round(t.fromHigh * 1000) / 1000,
      };
    console.log(`${code}: ${t ? `${t.regime} for ${t.days} days` : 'no data'}`);
  }
  const groups = new Map<string, { r1w: number[]; r1m: number[]; r3m: number[]; r6m: number[]; vol: number[]; up: number }>();
  for (const u of universe) {
    const S = u.series!;
    const n = S.c.length - 1;
    const sector = sectorOf[u.symbol];
    if (!sector || n < 260 || pkDay(S.c[n].t) !== day || liquidityAt(S, n) < MIN_LIQUIDITY) continue;
    const g = groups.get(sector) ?? { r1w: [], r1m: [], r3m: [], r6m: [], vol: [], up: 0 };
    g.r1w.push(S.cl[n] / S.cl[n - 5] - 1);
    g.r1m.push(S.cl[n] / S.cl[n - 21] - 1);
    g.r3m.push(S.cl[n] / S.cl[n - 63] - 1);
    g.r6m.push(S.cl[n] / S.cl[n - 126] - 1);
    const avg = (a: number, b: number) => S.c.slice(a, b + 1).reduce((x, c) => x + c.v, 0) / (b - a + 1);
    g.vol.push(avg(n - 4, n) / (avg(n - 59, n) || 1));
    if (S.e200[n] != null && S.cl[n] > (S.e200[n] as number)) g.up++;
    groups.set(sector, g);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const market: MarketFeed = {
    v: 1,
    kind: 'market',
    day,
    generatedAt: new Date(now).toISOString(),
    breadth,
    indices,
    ...(stale ? { stale: true } : {}),
    sectors: [...groups]
      .filter(([, g]) => g.r1m.length >= 2)
      .map(
        ([name, g]) =>
          [
            name,
            g.r1m.length,
            r3(mean(g.r1w)),
            r3(mean(g.r1m)),
            Math.round(mean(g.vol) * 100) / 100,
            r3(g.up / g.r1m.length),
            r3(mean(g.r3m)),
            r3(mean(g.r6m)),
          ] as MarketFeed['sectors'][number],
      )
      .sort((a, b) => b[3] - a[3]),
  };
  // 7. Market mood (0 fear … 100 greed) from the liquid stocks and the KSE-100, with what followed each mood.
  if (kse && kse.length > 400) {
    const hist = moodHistory(kse, universe, { minLiquidity: MIN_LIQUIDITY });
    const last = hist[hist.length - 1];
    if (last) {
      market.mood = { score: last.score, parts: last.parts, day: last.day };
      const feed: MoodFeed = {
        v: 1,
        kind: 'mood',
        day: last.day,
        generatedAt: new Date(now).toISOString(),
        now: last,
        history: hist.slice(-520).map((h) => [h.day, h.score]),
        since: hist[0].day,
        outcomes: moodOutcomes(hist, kse).map((o) => ({ ...o, avg: r3(o.avg), upShare: r3(o.upShare) })),
      };
      writeFileSync(join(stateDir, 'mood.json'), JSON.stringify(feed));
      console.log(`mood ${last.score} (${moodLabel(last.score)}) from ${hist.length} days`);
    }
  }

  // 8. Dividend calendar: upcoming book closures of every stock refreshed today.
  const rows: CalendarRow[] = [];
  let checked = 0;
  for (const u of universe) {
    const pay = await cached(`payouts:${u.symbol}`, 20 * 3600_000, () => fetchPayouts(u.symbol), { persist: true }).catch(() => null);
    if (!pay) continue;
    checked++;
    const price = u.candles[u.candles.length - 1].c;
    const dv = dividends(pay, { price, divYield: screener.get(u.symbol)?.divYield ?? null, fiscalEndMonth: 11 });
    for (const x of dv.list) {
      if (x.bookClosure == null || x.bookClosure < now - DAY || !(x.dps > 0 || x.bonusPct > 0)) continue;
      rows.push([u.symbol, x.bookClosure, Math.round(x.dps * 100) / 100, x.bonusPct, x.announced, price]);
    }
    await sleep(250);
  }
  const calendar: CalendarFeed = {
    v: 1,
    kind: 'calendar',
    day,
    generatedAt: new Date(now).toISOString(),
    checked,
    rows: rows.sort((a, b) => a[1] - b[1]),
  };
  writeFileSync(join(stateDir, 'calendar.json'), JSON.stringify(calendar));
  console.log(`dividend calendar: ${rows.length} upcoming from ${checked} stocks`);

  // 9. Long-term list (an experiment, shown as one): formed on the first run of each month, then scored.
  try {
    const ltItems = [];
    for (const u of universe) {
      const S = u.series!;
      if (liquidityAt(S, S.c.length - 1) < LT.minLiquidity || pkDay(S.c[S.c.length - 1].t) !== day) continue;
      const co = await cached(`company:${u.symbol}`, 3 * DAY, () => fetchCompany(u.symbol), { persist: true }).catch(() => null);
      ltItems.push({ symbol: u.symbol, sector: co?.sector ?? sectorOf[u.symbol] ?? null, candles: u.candles, annual: co?.financialsAnnual ?? null });
      await sleep(150);
    }
    const ltToday = longTermList(ltItems);
    const ltPath = join(stateDir, 'longterm-lists.json');
    const months: LtMonth[] = existsSync(ltPath) ? JSON.parse(readFileSync(ltPath, 'utf8')) : [];
    const month = day.slice(0, 7);
    if (!months.some((m) => m.month === month) && ltItems.length >= 40) {
      months.push({
        month,
        day,
        picks: ltToday.list.map((r) => [r.symbol, r.price]),
        base: ltItems.map((x) => [x.symbol, x.candles[x.candles.length - 1].c] as [string, number]),
        rows: ltToday.list,
      });
      writeFileSync(ltPath, JSON.stringify(months));
    }
    const closeOf = new Map(universe.map((u) => [u.symbol, u.candles[u.candles.length - 1].c]));
    const thisMonth = months.find((m) => m.month === month) ?? months[months.length - 1];
    if (thisMonth) {
      const lt: LtFeed = {
        v: 1,
        kind: 'longterm',
        day,
        generatedAt: new Date(now).toISOString(),
        month: thisMonth.month,
        formed: thisMonth.day,
        picks: thisMonth.picks,
        list: thisMonth.rows ?? ltToday.list.filter((r) => thisMonth.picks.some(([s]) => s === r.symbol)),
        today: ltToday,
        record: months
          .map((m) => ({ m, r: monthReturn(m, (s) => closeOf.get(s) ?? null) }))
          .filter((x) => x.r && x.m.picks.length)
          .map(({ m, r }) => ({ month: m.month, day: m.day, n: r!.n, ret: r3(r!.ret), base: r3(r!.base) })),
      };
      writeFileSync(join(stateDir, 'longterm.json'), JSON.stringify(lt));
      console.log(
        `long-term list ${thisMonth.month}: ${thisMonth.picks.length} stocks; today ${ltToday.list.length} pass of ${ltToday.valued} valued, ${ltToday.belowTrend} only below trend`,
      );
    }
  } catch (e) {
    console.log(`long-term list failed: ${(e as Error).message}`);
  }

  // 10. News headlines from Pakistani business feeds, tagged to the companies they name.
  try {
    const companies = (syms ?? []).filter((x) => !/ETF|MODARABA|MUTUAL|FUND|BOND|TFC|SUKUK/i.test(x.sectorName ?? '')).map((x) => ({ symbol: x.symbol, name: x.name }));
    const collected: { source: number; item: RawItem }[] = [];
    for (let i = 0; i < NEWS_FEEDS.length; i++) {
      const xml = await fetch(NEWS_FEEDS[i].url, { headers: { 'User-Agent': 'Mozilla/5.0 (Sahm news reader)' }, signal: AbortSignal.timeout(20_000) })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '');
      for (const item of parseRss(xml)) collected.push({ source: i, item });
    }
    // keep stories already collected on earlier runs, so the last few days stay even when a feed only lists its newest items
    const newsPath = join(stateDir, 'news.json');
    const old: NewsFeed | null = existsSync(newsPath) ? JSON.parse(readFileSync(newsPath, 'utf8')) : null;
    for (const r of old?.rows ?? []) collected.push({ source: r[1], item: { title: r[2], url: r[3], t: r[0], snippet: '' } });
    const rows = companies.length ? buildNews(collected, buildMatcher(companies), now, 7) : [];
    if (rows.length) {
      const feed: NewsFeed = { v: 1, kind: 'news', generatedAt: new Date(now).toISOString(), sources: NEWS_FEEDS.map((f) => f.source), rows };
      writeFileSync(newsPath, JSON.stringify(feed));
    }
    console.log(`news: ${rows.length} kept of ${collected.length}, ${rows.filter((r) => r[4].length).length} name a company`);
  } catch (e) {
    console.log(`news failed: ${(e as Error).message}`);
  }

  let mbody = JSON.stringify(market);
  while (mbody.length > 3900 && market.sectors.length) {
    // drop the smallest sectors first
    market.sectors.splice(
      market.sectors.reduce((k, x, i, a) => (x[1] < a[k][1] ? i : k), 0),
      1,
    );
    mbody = JSON.stringify(market);
  }
  writeFileSync(join(stateDir, 'market.json'), mbody);
  console.log(
    `sectors: ${market.sectors
      .slice(0, 3)
      .map((x) => `${x[0]} ${(x[3] * 100).toFixed(1)}%`)
      .join(', ')} … ${market.sectors
      .slice(-2)
      .map((x) => `${x[0]} ${(x[3] * 100).toFixed(1)}%`)
      .join(', ')}`,
  );
  if (process.env.PUBLISH === '1') {
    const res = await fetch(`${NTFY}/${FEED_TOPIC}`, { method: 'POST', body: mbody, headers: { Title: `Sahm market ${day}` } });
    console.log(`published market report to ntfy: ${res.status}`);
    if (!res.ok) process.exitCode = 1;
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
