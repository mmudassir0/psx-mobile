/** Fresh figures for the watchlist and market widgets, fetched from PSX (in the app or in the background). */
import { fetchBoard, fetchIndices, fetchSeries, INDEX_NAMES } from '../psx/api';
import { load, save } from '../storage';
import { MARKET_KEY, WATCH_KEY, type MarketData, type WatchData } from './MarketWidgets';

export const WIDGET_INDICES = ['KSE100', 'KMI30', 'KSE30', 'ALLSHR'];

export async function freshWatch(): Promise<WatchData | null> {
  const symbols = await load<string[]>('user.watchlist', []);
  try {
    const board = await fetchBoard();
    const by = new Map(board.map((b) => [b.symbol, b]));
    const data: WatchData = { rows: symbols.map((s) => ({ symbol: s, price: by.get(s)?.price ?? null, changePct: by.get(s)?.changePct ?? null })), at: Date.now() };
    await save(WATCH_KEY, data);
    return data;
  } catch {
    const last = await load<WatchData | null>(WATCH_KEY, null);
    // the list may have changed since: keep its order, last prices where known
    if (!last) return symbols.length ? { rows: symbols.map((s) => ({ symbol: s, price: null, changePct: null })), at: 0 } : null;
    const by = new Map(last.rows.map((r) => [r.symbol, r]));
    return { rows: symbols.map((s) => by.get(s) ?? { symbol: s, price: null, changePct: null }), at: last.at };
  }
}

export async function freshMarket(): Promise<MarketData | null> {
  try {
    const ix = await fetchIndices();
    const rows = WIDGET_INDICES.map((c) => ix.find((i) => i.code === c))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => ({ code: i.code, label: (INDEX_NAMES as Record<string, string>)[i.code] ?? i.code, value: i.current, change: i.change, changePct: i.changePct }));
    let up: number | undefined;
    let down: number | undefined;
    try {
      const b = await fetchBoard();
      up = b.filter((x) => (x.changePct ?? 0) > 0 && (x.volume ?? 0) > 0).length;
      down = b.filter((x) => (x.changePct ?? 0) < 0 && (x.volume ?? 0) > 0).length;
    } catch {
      // breadth is a bonus
    }
    const data: MarketData = { rows, up, down, at: Date.now() };
    await save(MARKET_KEY, data);
    return data;
  } catch {
    return load<MarketData | null>(MARKET_KEY, null);
  }
}

/** The chosen stock for the stock widget, with its last three months of closes. */
export async function freshStock(): Promise<import('./StockWidget').StockWidgetData | null> {
  const { STOCK_KEY, STOCK_PICK_KEY } = await import('./StockWidget');
  const pick = await load<{ symbol: string; name: string } | null>(STOCK_PICK_KEY, null);
  if (!pick) return null;
  const last = await load<import('./StockWidget').StockWidgetData | null>(STOCK_KEY, null);
  try {
    const [board, series] = await Promise.all([fetchBoard(), fetchSeries('eod', pick.symbol).catch(() => null)]);
    const q = board.find((b) => b.symbol === pick.symbol);
    const closes = series?.length ? series.slice(-63).map((p) => p.v) : last?.symbol === pick.symbol ? last.closes : [];
    const data = { symbol: pick.symbol, name: pick.name, price: q?.price ?? last?.price ?? null, changePct: q?.changePct ?? null, closes, at: Date.now() };
    await save(STOCK_KEY, data);
    return data;
  } catch {
    return last?.symbol === pick.symbol ? last : { symbol: pick.symbol, name: pick.name, price: null, changePct: null, closes: [], at: 0 };
  }
}
