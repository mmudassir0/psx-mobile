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

/** New raw bars merged onto saved (adjusted) ones, or null when they don't line up. */
export function topUp(saved: Candle[], fresh: Candle[]): Candle[] | null {
  if (!saved.length || !fresh.length) return null;
  const byT = new Map(saved.map((b) => [b.t, b]));
  const overlap = fresh.filter((b) => byT.has(b.t));
  if (!overlap.length) return null;
  const aligned = overlap.every((b) => Math.abs(b.c / byT.get(b.t)!.c - 1) <= TOLERANCE);
  if (!aligned) return null;
  const first = fresh[0].t;
  return [...saved.filter((b) => b.t < first), ...fresh];
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
      return save(full, now);
    } catch (e) {
      if (hit) {
        lastSource = 'stale';
        return unpack(hit.data.bars);
      }
      throw e;
    }
  });
}
