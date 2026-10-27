/**
 * Your real return over time. Once a day (whenever the app has prices) Sahm
 * saves a snapshot of your holdings: shares, total cost and price of each.
 * Comparing snapshots gives the return the market gave you, without counting
 * the money you put in or took out:
 *
 *   - more shares at a higher total cost = you bought (new money, not profit)
 *   - more shares at the same total cost = bonus shares (nothing in or out)
 *   - fewer shares = you sold, at about that day's price (money out)
 *   - cash dividends on the ex-date count as return, as in the KSE-100
 *
 * Daily returns are chained (time-weighted), the way funds report returns.
 * Snapshots stay on this phone and are in the backup.
 */
import { useEffect } from 'react';
import { load, save } from '../storage';
import { pkToday } from '../journal/store';
import type { Candle, SeriesPoint } from '../psx/types';
import type { Row } from './useReviews';
import { cashDividends } from '../analysis/dividends';

export const TRACK_KEY = 'real.snapshots';
const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export interface Snap {
  day: string;
  value: number;
  /** symbol → [shares, total cost, price] */
  pos: Record<string, [number, number, number]>;
  /** gross cash dividends earned since the previous snapshot */
  div: number;
}

export interface TrackInput {
  symbol: string;
  shares: number;
  avgCost: number;
  price: number;
  /** cash dividends: ex-date and Rs per share */
  cash: { exT: number; dps: number }[];
}

/** Adds or replaces today's snapshot. Returns the same list when nothing can be recorded. */
export function addSnapshot(list: Snap[], rows: TrackInput[], day: string): Snap[] {
  if (!rows.length || rows.some((r) => !(r.price > 0) || !(r.shares > 0))) return list;
  const prev = [...list].reverse().find((s) => s.day < day) ?? null;
  let div = 0;
  if (prev) {
    for (const r of rows) {
      const had = prev.pos[r.symbol]?.[0] ?? 0;
      if (!had) continue;
      for (const c of r.cash) {
        const d = pkDay(c.exT);
        if (d > prev.day && d <= day) div += had * c.dps;
      }
    }
  }
  const snap: Snap = {
    day,
    value: rows.reduce((a, r) => a + r.shares * r.price, 0),
    pos: Object.fromEntries(rows.map((r) => [r.symbol, [r.shares, r.shares * r.avgCost, r.price]])),
    div,
  };
  const kept = list.filter((s) => s.day < day);
  return [...kept, snap].slice(-1500);
}

/** Money in (+) or out (−) between two snapshots. */
export function flowBetween(a: Snap, b: Snap): number {
  let flow = 0;
  for (const sym of new Set([...Object.keys(a.pos), ...Object.keys(b.pos)])) {
    const [s0, c0, p0] = a.pos[sym] ?? [0, 0, 0];
    const [s1, c1, p1] = b.pos[sym] ?? [0, 0, p0];
    const d = s1 - s0;
    // Shares in or out are valued at that day's price: a real trade happens close to it, and holdings
    // typed in later (already owned) must not turn the gap between their old cost and today's price
    // into a one-day gain or loss.
    if (d < 0) flow += d * (p1 || p0);
    else if (d > 0 && c1 - c0 > 0.5) flow += d * (p1 || p0);
    // more shares at the same cost: bonus shares, nothing in or out
  }
  return flow;
}

export interface TrackPoint {
  day: string;
  /** cumulative return since the first snapshot, e.g. 0.12 */
  ret: number;
}

export function trackReturns(list: Snap[]): TrackPoint[] {
  if (!list.length) return [];
  const out: TrackPoint[] = [{ day: list[0].day, ret: 0 }];
  let growth = 1;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    const flow = flowBetween(a, b);
    const base = a.value + flow / 2;
    let r = base > 0 ? (b.value + b.div - a.value - flow) / base : 0;
    // a jump this big in one step is missing prices, not a real return
    if (!Number.isFinite(r) || Math.abs(r) > 0.4) r = 0;
    growth *= 1 + r;
    out.push({ day: b.day, ret: growth - 1 });
  }
  return out;
}

/** The index's value on or before each day. */
export function alignIndex(index: SeriesPoint[], days: string[]): (number | null)[] {
  const pts = index.map((p) => [pkDay(p.t), p.v] as const);
  let k = 0;
  let last: number | null = null;
  return days.map((d) => {
    while (k < pts.length && pts[k][0] <= d) last = pts[k++][1];
    return last;
  });
}

/** Cumulative index return over the same days, starting at 0. */
export function indexReturns(index: SeriesPoint[], days: string[]): (number | null)[] {
  const v = alignIndex(index, days);
  const start = v.find((x) => x != null) ?? null;
  return v.map((x) => (x == null || start == null ? null : x / start - 1));
}

/**
 * What your current holdings (today's shares) did over the last `bars`
 * sessions, dividends included: not your actual return, since you may not
 * have owned them all along, but a fair check of the stocks you chose.
 */
export function mixReturns(items: { shares: number; candles: Candle[]; cash: { exT: number; dps: number }[] }[], days: string[]): (number | null)[] {
  const parts = items
    .filter((x) => x.candles.length > 1 && x.shares > 0)
    .map((x) => {
      // total-return factor per day: price moves plus dividends on the ex-date
      const ex = new Map<string, number>();
      for (const c of x.cash) ex.set(pkDay(c.exT), (ex.get(pkDay(c.exT)) ?? 0) + c.dps);
      const tr: [string, number][] = [];
      let f = 1;
      for (let i = 0; i < x.candles.length; i++) {
        const c = x.candles[i];
        if (i > 0) {
          const p0 = x.candles[i - 1].c;
          if (p0 > 0) f *= (c.c + (ex.get(pkDay(c.t)) ?? 0)) / p0;
        }
        tr.push([pkDay(c.t), f]);
      }
      const now = tr[tr.length - 1][1];
      const value = x.shares * x.candles[x.candles.length - 1].c;
      let k = 0;
      let last: number | null = null;
      const at = days.map((d) => {
        while (k < tr.length && tr[k][0] <= d) last = tr[k++][1];
        return last == null ? null : (value * last) / now;
      });
      return at;
    });
  if (!parts.length) return days.map(() => null);
  // a stock with no price yet on a day is counted at its first known value
  const series = days.map((_, i) => {
    let v = 0;
    for (const p of parts) v += p[i] ?? p.find((x) => x != null) ?? 0;
    return v;
  });
  const start = series[0];
  return series.map((v) => (start > 0 ? v / start - 1 : null));
}

// ------------------------------------------------------------ storage ----

let chain: Promise<unknown> = Promise.resolve();
let cache: Snap[] | null = null;
let savedAt = 0;
const SAVE_EVERY_MS = 15 * 60_000;

/** Same day and the same shares and costs: only prices moved. */
function onlyPrices(a: Snap | undefined, b: Snap): boolean {
  if (!a || a.day !== b.day) return false;
  const ka = Object.keys(a.pos);
  if (ka.length !== Object.keys(b.pos).length) return false;
  return ka.every((k) => b.pos[k] && b.pos[k][0] === a.pos[k][0] && Math.abs(b.pos[k][1] - a.pos[k][1]) < 0.5);
}
const listeners = new Set<(s: Snap[]) => void>();

export async function snapshots(): Promise<Snap[]> {
  if (!cache) cache = await load<Snap[]>(TRACK_KEY, []);
  return cache;
}

export function recordSnapshot(rows: TrackInput[], now = Date.now()) {
  chain = chain.then(async () => {
    const cur = await snapshots();
    const next = addSnapshot(cur, rows, pkToday(now));
    if (next === cur) return;
    // live prices change every 30 seconds while the market is open; the saved history only needs
    // today's latest value now and then (the day's last snapshot is kept whenever the app is reopened)
    if (onlyPrices(cur[cur.length - 1], next[next.length - 1]) && now - savedAt < SAVE_EVERY_MS) return;
    savedAt = now;
    cache = next;
    await save(TRACK_KEY, next);
    listeners.forEach((l) => l(next));
  });
  return chain;
}

/** After a backup is restored. */
export async function reloadSnapshots() {
  cache = null;
  savedAt = 0;
  const s = await snapshots();
  listeners.forEach((l) => l(s));
}

export function onSnapshots(l: (s: Snap[]) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Records today's snapshot once every holding has a price and its review data. */
export function useTrackSnapshot(rows: Row[], loading: boolean) {
  useEffect(() => {
    // only with real market prices: before they load, the price falls back to your average cost
    if (loading || !rows.length || rows.some((r) => !(r.stock?.price && r.stock.price > 0))) return;
    recordSnapshot(rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, avgCost: r.holding.avgCost, price: r.price, cash: cashDividends(r.dividends) })));
  }, [loading, rows]);
}

/**
 * The same money in the index on the same days: your first snapshot's value buys
 * index "units" that day, every rupee you add later buys more at that day's level,
 * and money taken out sells units. Your side is today's value plus the cash
 * dividends received (before tax), as the index counts them.
 */
export function shadowIndex(list: Snap[], index: SeriesPoint[]): { from: string; invested: number; mine: number; index: number; dividends: number } | null {
  if (list.length < 2 || !index.length) return null;
  const at = alignIndex(index, list.map((s) => s.day));
  if (at[0] == null || at[at.length - 1] == null) return null;
  let units = list[0].value / at[0];
  let invested = list[0].value;
  let dividends = 0;
  for (let i = 1; i < list.length; i++) {
    const f = flowBetween(list[i - 1], list[i]);
    const lv = at[i];
    if (f && lv) units += f / lv;
    invested += f;
    dividends += list[i].div;
  }
  const last = list[list.length - 1];
  return { from: list[0].day, invested, mine: last.value + dividends, index: Math.max(0, units) * at[at.length - 1]!, dividends };
}
