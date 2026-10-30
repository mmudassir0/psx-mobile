/**
 * Background alerts: about every 15 minutes while PSX is open (Android decides
 * the exact moment, and may wait longer to save battery), Sahm checks live
 * prices against your lines and for big moves in what you hold; once after the
 * close it checks closes against your chart lines and sends the day's summary.
 * Nothing is downloaded outside those times.
 */
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { makePref } from '../prefs';
import { load, save } from '../storage';
import { fetchBoard } from '../psx/api';
import { isMarketOpen, lastSessionEnd } from '../market-hours';
import { notifyNow } from '../notify';
import { priceLine } from '../analysis/watch';
import { chartLinesPref, watchRulesPref } from './prefs';
import { targetsPref } from './targets';
import { bigMoveHits, daySummary, intradayHits, type PriceLine } from './intradayCore';
import { getHoldings } from './holdings';
import type { BoardQuote } from '../psx/types';
import { logProblem } from '../log';

export const INTRADAY_TASK = 'sahm-intraday-alerts';
export const intradayPref = makePref<boolean>('ui.intradayAlerts', false);
/** set once Sahm has switched background alerts on by itself (or you chose), so it never does again */
export const intradayChosenPref = makePref<boolean>('ui.intradayChosen', false);
/** a holding moving this much (percent) in a day is worth a notification; 0 turns it off */
export const bigMovePref = makePref<number>('ui.bigMoveAlert', 5);
/** after the close: one line on what your holdings did today */
export const daySummaryPref = makePref<boolean>('ui.daySummary', true);
/** after the close: new stocks matching your saved Market screens */
export const screenAlertsPref = makePref<boolean>('ui.screenAlerts', true);
const SCREEN_ALERTED_KEY = 'intraday.screenAlerted';
const EVENING_KEY = 'intraday.evening';
const LAST_KEY = 'intraday.last';
const SENT_KEY = 'intraday.sent';
const pkDay = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

export async function linesToWatch(): Promise<PriceLine[]> {
  const [rules, targets, chart] = await Promise.all([watchRulesPref.get(), targetsPref.get(), chartLinesPref.get()]);
  const out: PriceLine[] = [];
  for (const r of rules) {
    const lv = priceLine(r);
    if (lv != null) out.push({ symbol: r.symbol, level: lv, dir: r.dir, label: 'your alert line' });
  }
  for (const [s, t] of Object.entries(targets)) {
    if (t.target != null) out.push({ symbol: s, level: t.target, dir: '>', label: 'your target' });
    if (t.rethink != null) out.push({ symbol: s, level: t.rethink, dir: '<', label: 'your rethink price' });
  }
  for (const [s, l] of Object.entries(chart)) for (const lv of l.levels) out.push({ symbol: s, level: lv.price, dir: 'any', label: 'your chart line' });
  return out;
}

/** One check; returns how many alerts went out. */
export async function checkIntraday(force = false, given?: BoardQuote[]): Promise<number> {
  if (!force && !isMarketOpen()) return 0;
  const lines = await linesToWatch();
  if (!lines.length) return 0;
  const board = given ?? (await fetchBoard());
  const want = new Set(lines.map((l) => l.symbol));
  const now: Record<string, number> = {};
  for (const b of board) if (want.has(b.symbol) && b.price) now[b.symbol] = b.price;
  const prev = await load<{ day: string; prices: Record<string, number> } | null>(LAST_KEY, null);
  const day = pkDay();
  const sent = new Set(await load<string[]>(SENT_KEY, []));
  // the very first check only remembers the prices; later ones (even the next morning) compare with the last check
  const hits = prev ? intradayHits(lines, prev.prices, now, sent, day) : [];
  await save(LAST_KEY, { day, prices: { ...(prev?.prices ?? {}), ...now } });
  if (!hits.length) return 0;
  for (const h of hits) sent.add(h.key);
  await save(SENT_KEY, [...sent].filter((k) => k.startsWith(day)).slice(-200));
  const one = new Set(hits.map((h) => h.symbol)).size === 1 ? hits[0].symbol : null;
  await notifyNow(hits.length === 1 ? `${hits[0].symbol}: a line crossed` : `${hits.length} of your lines crossed`, hits.map((h) => h.text).join('\n'), one ? `sahm://stock/${one}` : 'sahm://alerts');
  return hits.length;
}

/** Holdings moving more than your threshold today. */
export async function checkBigMoves(board: BoardQuote[]): Promise<number> {
  const threshold = await bigMovePref.get();
  const held = (await getHoldings()).map((h) => h.symbol);
  if (!(threshold > 0) || !held.length) return 0;
  const day = pkDay();
  const sent = new Set(await load<string[]>(SENT_KEY, []));
  const hits = bigMoveHits(held, board, threshold, sent, day);
  if (!hits.length) return 0;
  for (const h of hits) sent.add(h.key);
  await save(SENT_KEY, [...sent].filter((k) => k.startsWith(day)).slice(-200));
  await notifyNow(hits.length === 1 ? `${hits[0].symbol}: a big move` : `${hits.length} of your holdings moved a lot`, hits.map((h) => h.text).join('\n'), hits.length === 1 ? `sahm://stock/${hits[0].symbol}` : 'sahm://portfolio');
  return hits.length;
}

/** Once per session, after the close: closes across your chart lines, and the day's summary. */
export async function checkEvening(now = Date.now()): Promise<void> {
  const end = lastSessionEnd(now);
  // only on the evening of the session (not days later), and once
  if (now - end > 8 * 3600_000 || (await load<number>(EVENING_KEY, 0)) >= end) return;
  await save(EVENING_KEY, end);
  const { checkLineAlerts } = await import('./useLineAlerts');
  await checkLineAlerts().catch((e) => logProblem('evening line alerts', e));
  let board: BoardQuote[] | null = null;
  const boardNow = async () => (board ??= await fetchBoard());
  if (await daySummaryPref.get()) {
    const holdings = await getHoldings();
    if (holdings.length) {
      const s = daySummary(holdings, await boardNow());
      if (s) await notifyNow(s.title, s.body, 'sahm://portfolio');
    }
  }
  if (await screenAlertsPref.get()) await checkSavedScreens(boardNow).catch((e) => logProblem('evening screen alerts', e));
}

/** New stocks in your saved Market screens, with the closing prices. */
async function checkSavedScreens(boardNow: () => Promise<BoardQuote[]>): Promise<void> {
  const { savedScreensPref, screenAlertHits, screenMatches } = await import('../analysis/savedScreens');
  const saved = await savedScreensPref.get();
  if (!saved.some((x) => x.mode === 'all' && x.seenAt)) return;
  const { fetchScreener } = await import('../psx/api');
  const { mergeStocks } = await import('../psx/merge');
  const { balanceSheetFor } = await import('../analysis/ratios');
  const { loadCached, saveCached } = await import('../storage');
  const [symbols, screener, brd] = await Promise.all([loadCached<import('../psx/types').SymbolInfo[]>('psx.symbols'), fetchScreener(), boardNow()]);
  // keep them for the app too: it opens on the closing figures without downloading them again
  await saveCached('psx.screener', screener);
  await saveCached('psx.board', brd);
  const stocks = mergeStocks(symbols?.data ?? [], screener, brd);
  const { hits, alerted } = screenAlertHits(saved, (sc) => screenMatches(sc, stocks, balanceSheetFor), await load<Record<string, string[]>>(SCREEN_ALERTED_KEY, {}));
  await save(SCREEN_ALERTED_KEY, alerted);
  if (!hits.length) return;
  const lines = hits.map((h) => `${h.name}: ${h.symbols.slice(0, 6).join(', ')}${h.symbols.length > 6 ? ` and ${h.symbols.length - 6} more` : ''}`);
  const n = hits.reduce((a, h) => a + h.symbols.length, 0);
  await notifyNow(n === 1 ? `New in "${hits[0].name}": ${hits[0].symbols[0]}` : `${n} new stocks in your saved screens`, lines.join('\n'), 'sahm://market');
}

/** What the background task does each time Android wakes it. */
export async function checkBackground(): Promise<void> {
  if (isMarketOpen()) {
    const board = await fetchBoard();
    await checkIntraday(false, board);
    await checkBigMoves(board);
  } else await checkEvening();
}

/** Called from index.ts at startup, before anything else, so Android can wake the task. */
export function defineIntradayTask() {
  if (Platform.OS !== 'android') return;
  TaskManager.defineTask(INTRADAY_TASK, async () => {
    try {
      await checkBackground();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      logProblem('intraday alerts', e);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function setIntraday(on: boolean): Promise<string | null> {
  if (Platform.OS !== 'android') return 'Only on Android.';
  try {
    if (on) {
      const st = await BackgroundTask.getStatusAsync();
      if (st === BackgroundTask.BackgroundTaskStatus.Restricted) return 'Background work is restricted for Sahm: allow it in the phone settings (Battery → Sahm → Unrestricted).';
      await BackgroundTask.registerTaskAsync(INTRADAY_TASK, { minimumInterval: 15 });
    } else if (await TaskManager.isTaskRegisteredAsync(INTRADAY_TASK)) await BackgroundTask.unregisterTaskAsync(INTRADAY_TASK);
    await intradayPref.set(on);
    await intradayChosenPref.set(true);
    return null;
  } catch (e) {
    logProblem('intraday alerts', e);
    return (e as Error).message;
  }
}

/**
 * Background alerts come on by themselves the first time there's something to watch (holdings or
 * alert lines) and notifications are already allowed; after that it's your switch. Never asks for
 * permission here: that happens when you set an alert.
 */
export async function autoIntraday(hasSomething: boolean): Promise<void> {
  if (Platform.OS !== 'android' || !hasSomething) return;
  if ((await intradayChosenPref.get()) || (await intradayPref.get())) return;
  const { ensureReady } = await import('../notify');
  if (!(await ensureReady(false))) return;
  await setIntraday(true);
}
