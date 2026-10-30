/** Saved Market screens: a named set of filters, list and sort, opened in one tap, with "N new since you last looked". */
import { makePref } from '../prefs';
import { passes, screen, type FilterId, type SortId } from './screener';
import type { Stock } from '../psx/types';
import type { BalanceSheet } from './ratios';

export type ScreenMode = 'gainers' | 'losers' | 'active' | 'all' | 'watch';

export interface SavedScreen {
  id: string;
  name: string;
  mode: ScreenMode;
  filters: FilterId[];
  sort: SortId;
  sector: string | null;
  shariahOnly: boolean;
  /** symbols that matched when it was last opened */
  seen: string[];
  seenAt: number;
}

export type ScreenSettings = Pick<SavedScreen, 'mode' | 'filters' | 'sort' | 'sector' | 'shariahOnly'>;

export const savedScreensPref = makePref<SavedScreen[]>('user.savedScreens', []);

export const isSavedScreens = (v: unknown): v is SavedScreen[] =>
  Array.isArray(v) && v.every((s) => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.filters) && Array.isArray(s.seen));

/** Sensible name from the settings, e.g. "Shariah · KSE-100 · Dividend 8%+". */
export function suggestName(s: ScreenSettings, filterLabel: (f: FilterId) => string, sectorLabel: (x: string) => string): string {
  const parts = [s.shariahOnly ? 'Shariah' : null, s.sector ? sectorLabel(s.sector) : null, ...s.filters.map(filterLabel)].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : 'My screen';
}

export function saveScreen(list: SavedScreen[], name: string, s: ScreenSettings, matching: string[], now = Date.now()): SavedScreen[] {
  const n = name.trim() || 'My screen';
  const same = list.find((x) => x.name.toLowerCase() === n.toLowerCase());
  const entry: SavedScreen = {
    id: same?.id ?? `s${now}`,
    name: n,
    ...s,
    filters: [...s.filters],
    seen: [...matching].sort(),
    seenAt: now,
  };
  return same ? list.map((x) => (x.id === same.id ? entry : x)) : [...list, entry];
}

/** Stocks that match now but didn't when it was last opened. */
export function newSince(saved: SavedScreen, matching: string[]): string[] {
  const seen = new Set(saved.seen);
  return matching.filter((s) => !seen.has(s));
}

export const markSeen = (list: SavedScreen[], id: string, matching: string[], now = Date.now()): SavedScreen[] => list.map((x) => (x.id === id ? { ...x, seen: [...matching].sort(), seenAt: now } : x));

export const deleteScreen = (list: SavedScreen[], id: string) => list.filter((x) => x.id !== id);

export const sameSettings = (a: ScreenSettings, b: ScreenSettings) =>
  a.mode === b.mode && a.sort === b.sort && a.sector === b.sector && a.shariahOnly === b.shariahOnly && [...a.filters].sort().join() === [...b.filters].sort().join();

/** Which stocks a saved "all stocks" screen lists now (the same rules as the Market screen). */
export function screenMatches(sc: ScreenSettings, stocks: Stock[], bsOf: (symbol: string) => BalanceSheet | null): string[] {
  const l = stocks.filter((x) => (!sc.shariahOnly || x.shariah) && (!sc.sector || x.sector === sc.sector) && sc.filters.every((f) => passes(f, x, bsOf(x.symbol))));
  return screen(l, [], sc.sort, bsOf).map((x) => x.symbol);
}

/**
 * New matches worth a notification: stocks in a saved screen of all stocks (with at least one filter)
 * that weren't there when you last looked and haven't been notified before.
 */
export function screenAlertHits(
  saved: SavedScreen[],
  matchesOf: (sc: SavedScreen) => string[],
  alerted: Record<string, string[]>,
): { hits: { id: string; name: string; symbols: string[] }[]; alerted: Record<string, string[]> } {
  const hits: { id: string; name: string; symbols: string[] }[] = [];
  const next: Record<string, string[]> = {};
  for (const sc of saved) {
    if (sc.mode !== 'all' || (!sc.filters.length && !sc.sector && !sc.shariahOnly) || !sc.seenAt) continue;
    const now = matchesOf(sc);
    const before = new Set(alerted[sc.id] ?? []);
    const fresh = newSince(sc, now).filter((x) => !before.has(x));
    // remember only what still matches, so a stock that drops out and comes back is news again
    next[sc.id] = [...new Set([...(alerted[sc.id] ?? []), ...fresh])].filter((x) => now.includes(x));
    if (fresh.length) hits.push({ id: sc.id, name: sc.name, symbols: fresh });
  }
  return { hits, alerted: next };
}
