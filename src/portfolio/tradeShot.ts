/** Choosing the trade to record from what was read off an order-confirmation screenshot. */
import type { ReadTrade } from './screenshot';

/**
 * One trade → use it. Several: for a given stock, its newest; otherwise, if one
 * day is newest and has a single trade, that one; else let the user pick
 * (orders filled in parts of the same stock, side and price are added up).
 */
export function pickConfirmation(trades: ReadTrade[], symbol: string | null): { one: ReadTrade | null; many: ReadTrade[] } {
  let list = symbol ? trades.filter((t) => t.symbol === symbol.toUpperCase()) : trades;
  // partial fills of one order
  const merged = new Map<string, ReadTrade>();
  for (const t of list) {
    const k = `${t.date}|${t.symbol}|${t.side}|${t.price}`;
    const m = merged.get(k);
    merged.set(k, m ? { ...m, shares: m.shares + t.shares } : { ...t });
  }
  list = [...merged.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!list.length) return { one: null, many: [] };
  if (list.length === 1) return { one: list[0], many: [] };
  const newest = list.filter((t) => t.date === list[0].date);
  if (newest.length === 1 && symbol) return { one: newest[0], many: [] };
  return { one: null, many: list.slice(0, 8) };
}
