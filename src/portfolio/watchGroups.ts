/** Named watchlists ("Banks to buy", "Dividend payers"): each stock can be in any number of them, and in the watchlist. */
import { makePref } from '../prefs';

export interface WatchGroup {
  id: string;
  name: string;
  symbols: string[];
}

export const watchGroupsPref = makePref<WatchGroup[]>('user.watchGroups', []);

export function addGroup(groups: WatchGroup[], name: string, now = Date.now()): WatchGroup[] {
  const n = name.trim();
  if (!n || groups.some((g) => g.name.toLowerCase() === n.toLowerCase())) return groups;
  return [...groups, { id: `w${now}`, name: n, symbols: [] }];
}

export function toggleInGroup(groups: WatchGroup[], id: string, symbol: string): WatchGroup[] {
  return groups.map((g) => (g.id !== id ? g : { ...g, symbols: g.symbols.includes(symbol) ? g.symbols.filter((s) => s !== symbol) : [...g.symbols, symbol] }));
}

export const renameGroup = (groups: WatchGroup[], id: string, name: string) => groups.map((g) => (g.id === id && name.trim() ? { ...g, name: name.trim() } : g));
export const deleteGroup = (groups: WatchGroup[], id: string) => groups.filter((g) => g.id !== id);
export const groupsOf = (groups: WatchGroup[], symbol: string) => groups.filter((g) => g.symbols.includes(symbol));
