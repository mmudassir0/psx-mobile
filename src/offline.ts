/**
 * Offline copy: once a day, while there's internet, Sahm downloads what your
 * holdings and watchlist need (company pages with results and announcements,
 * dividends, price history) and the daily files (picks, mood, calendar, news,
 * economy), so every screen works later without a connection. Everything goes
 * into the same saved cache the screens already fall back to.
 */
import { useEffect } from 'react';
import { makePref } from './prefs';
import { cached, COMPANY_TTL } from './psx/cache';
import { fetchCompany, fetchPayouts, fetchSeries } from './psx/api';
import { dailyCandles } from './psx/history';
import { fetchFeeds } from './picks/feed';
import { FEED_BASE } from './picks/config';
import { getJson } from './net';
import { eachLimit } from './limit';
import { logProblem } from './log';
import { offlineDue } from './offlineDue';
export { offlineDue };

export interface OfflineState {
  auto: boolean;
  /** last complete save, epoch ms */
  at: number;
  /** how many stocks were saved */
  stocks: number;
  /** how many downloads failed last time */
  failed: number;
}
export const offlinePref = makePref<OfflineState>('ui.offline', { auto: true, at: 0, stocks: 0, failed: 0 });

export const FEED_FILES = ['mood.json', 'calendar.json', 'news.json', 'macro.json', 'longterm.json'];
const INDEX_SERIES = ['KSE100', 'KMI30'];

let running: Promise<OfflineState> | null = null;

/** Downloads everything for these symbols; `onStep` gets "3 of 12". Runs once at a time. */
export function saveOffline(symbols: string[], onStep?: (done: number, total: number) => void): Promise<OfflineState> {
  if (running) return running;
  running = (async () => {
    const list = [...new Set(symbols)].slice(0, 60);
    const total = list.length + FEED_FILES.length + INDEX_SERIES.length + 1;
    let done = 0;
    let failed = 0;
    const step = () => onStep?.(++done, total);
    const attempt = async (f: () => Promise<unknown>) => {
      try {
        await f();
      } catch {
        failed++;
      }
      step();
    };
    await attempt(() => cached('picks:feeds', 10 * 60_000, fetchFeeds, { persist: true, force: true }));
    for (const name of FEED_FILES)
      await attempt(() =>
        cached(
          `feed:${name}`,
          60 * 60_000,
          async () => {
            const j = await getJson(`${FEED_BASE}/${name}?t=${Math.floor(Date.now() / 600_000)}`);
            if (!j || typeof j !== 'object') throw new Error('Unexpected feed file');
            return j;
          },
          { persist: true, force: true },
        ),
      );
    for (const ix of INDEX_SERIES) await attempt(() => cached(`eod:${ix}`, 30 * 60_000, () => fetchSeries('eod', ix), { persist: true, force: true }));
    await eachLimit(list, 2, (s) =>
      attempt(async () => {
        await cached(`company:${s}`, COMPANY_TTL, () => fetchCompany(s), { persist: true, force: true });
        await cached(`payouts:${s}`, 6 * 3600_000, () => fetchPayouts(s), { persist: true, force: true });
        await dailyCandles(s);
      }),
    );
    const prev = await offlinePref.get();
    const state = { ...prev, at: Date.now(), stocks: list.length, failed };
    await offlinePref.set(state);
    if (failed) logProblem('offline copy', new Error(`${failed} of ${total} downloads failed`));
    return state;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** On Home: the daily offline copy, a minute after opening so it doesn't slow the first screen. */
export function useOfflineCopy(symbols: string[], ready: boolean) {
  const s = offlinePref.use();
  const key = symbols.join();
  useEffect(() => {
    if (!ready || !s.auto || !symbols.length || !offlineDue(s.at)) return;
    const id = setTimeout(() => saveOffline(symbols).catch(() => {}), 60_000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.auto, s.at, key]);
}
