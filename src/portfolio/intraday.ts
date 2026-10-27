/**
 * Alerts during market hours, in the background: about every 15 minutes while
 * PSX is open (Android decides the exact moment, and may wait longer to save
 * battery), Sahm checks the live prices against your lines and notifies you.
 */
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { makePref } from '../prefs';
import { load, save } from '../storage';
import { fetchBoard } from '../psx/api';
import { isMarketOpen } from '../market-hours';
import { notifyNow } from '../notify';
import { priceLine } from '../analysis/watch';
import { chartLinesPref, watchRulesPref } from './prefs';
import { targetsPref } from './targets';
import { intradayHits, type PriceLine } from './intradayCore';
import { logProblem } from '../log';

export const INTRADAY_TASK = 'sahm-intraday-alerts';
export const intradayPref = makePref<boolean>('ui.intradayAlerts', false);
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
export async function checkIntraday(force = false): Promise<number> {
  if (!force && !isMarketOpen()) return 0;
  const lines = await linesToWatch();
  if (!lines.length) return 0;
  const board = await fetchBoard();
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

/** Called from index.ts at startup, before anything else, so Android can wake the task. */
export function defineIntradayTask() {
  if (Platform.OS !== 'android') return;
  TaskManager.defineTask(INTRADAY_TASK, async () => {
    try {
      await checkIntraday();
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
    return null;
  } catch (e) {
    logProblem('intraday alerts', e);
    return (e as Error).message;
  }
}
