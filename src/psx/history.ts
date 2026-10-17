/**
 * Daily price history, saved on the phone and topped up month by month.
 *
 * The first visit downloads the full ten years (plus PSX's adjusted closes,
 * to correct for splits and bonus issues). After that only the months since
 * the last saved day are fetched. They are checked against the saved days they
 * overlap: if the prices match, the new days are added; if not (a split or
 * bonus issue changed the basis), the full history is downloaded again. A full
 * download also happens weekly, to pick up any restatement.
 */
import type { Candle } from './types';
import { fetchDailyCandles, fetchMonthCandles } from './api';
import { actionGapAt } from './parse';
import { once, readEntry, writeEntry } from './cache';

export const FRESH_MS = 30 * 60_000;
export const FULL_EVERY_MS = 7 * 24 * 3600_000;
const MAX_MONTHS = 3;
const TOLERANCE = 0.005;
const PKT = 5 * 3600_000;

interface Saved {
  fullAt: number;
  /** [t, o, h, l, c, v] */
  bars: number[][];
}

const pack = (c: Candle[]) => c.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]);
const unpack = (rows: number[][]): Candle[] => rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));

export interface HistoryDeps {
  full: (symbol: string) => Promise<Candle[]>;
  month: (symbol: string, year: number, month: number) => Promise<Candle[]>;
  now: () => number;
}
const defaults: HistoryDeps = { full: fetchDailyCandles, month: fetchMonthCandles, now: Date.now };

/** Calendar months (Pakistan time) from the one containing `from` to the one containing `to`. */
export function monthsBetween(from: number, to: number): { year: number; month: number }[] {
  const a = new Date(from + PKT);
  const b = new Date(to + PKT);
  const out: { year: number; month: number }[] = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
    out.push({ year: y, month: m + 1 });
    if (++m === 12) {
      m = 0;
      y++;
    }
  }
  return out;
}

/**
 * Days newer than the last saved one, added to the saved (adjusted) history,
 * or null when a full download is needed instead.
 *
 * Only the last saved day is compared: earlier days in the same month may
 * have been adjusted by an earlier full download (after a split or bonus
 * issue) and would never match PSX's raw monthly bars again. Only the new days
 * are checked for a gap beyond the daily limit (a fresh bonus issue or split),
 * so an old gap that is already saved doesn't trigger a download every time.
 */
export function topUp(saved: Candle[], fresh: Candle[]): Candle[] | null {
  if (!saved.length || !fresh.length) return null;
  const last = saved[saved.length - 1];
  const same = fresh.find((b) => b.t === last.t);
  if (!same || Math.abs(same.c / last.c - 1) > TOLERANCE) return null;
  const added = fresh.filter((b) => b.t > last.t);
  const merged = [...saved, ...added];
  for (let i = saved.length; i < merged.length; i++) if (actionGapAt(merged, i) != null) return null;
  return merged;
}

/**
 * True when one of the last two days has a gap beyond the daily limit: on the
 * ex-date of a bonus issue PSX may not have adjusted its series yet. (A gap that
 * stays is a large cash dividend, which PSX never adjusts, so it isn't retried.)
 */
export function recentGap(bars: Candle[], days = 2): boolean {
  for (let i = Math.max(1, bars.length - days); i < bars.length; i++) if (actionGapAt(bars, i) != null) return true;
  return false;
}

export type HistorySource = 'memory' | 'saved' | 'topped-up' | 'full' | 'stale';
export let lastSource: HistorySource | null = null; // for tests and the debug log

export async function dailyCandles(symbol: string, opts: { force?: boolean } = {}, deps: HistoryDeps = defaults): Promise<Candle[]> {
  const key = `daily:${symbol}`;
  const hit = await readEntry<Saved>(key, true);
  const now = deps.now();
  if (!opts.force && hit && now - hit.at < FRESH_MS) {
    lastSource = 'saved';
    return unpack(hit.data.bars);
  }
  return once(key, async () => {
    const save = async (bars: Candle[], fullAt: number) => {
      await writeEntry<Saved>(key, { fullAt, bars: pack(bars) }, true, now);
      return bars;
    };
    try {
      if (hit && now - hit.data.fullAt < FULL_EVERY_MS) {
        const saved = unpack(hit.data.bars);
        const months = monthsBetween(saved[saved.length - 1].t, now);
        if (months.length <= MAX_MONTHS) {
          const fresh = (await Promise.all(months.map((m) => deps.month(symbol, m.year, m.month)))).flat().sort((a, b) => a.t - b.t);
          const merged = topUp(saved, fresh);
          if (merged) {
            lastSource = 'topped-up';
            return save(merged, hit.data.fullAt);
          }
        }
      }
      const full = await deps.full(symbol);
      lastSource = 'full';
      // If PSX hasn't adjusted for a fresh bonus issue yet, try a full download again in six hours.
      return save(full, recentGap(full) ? now - FULL_EVERY_MS + 6 * 3600_000 : now);
    } catch (e) {
      if (hit) {
        lastSource = 'stale';
        return unpack(hit.data.bars);
      }
      throw e;
    }
  });
}
