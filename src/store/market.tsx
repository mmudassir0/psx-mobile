import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchBoard, fetchIndices, fetchScreener, fetchSymbols } from '../psx/api';
import type { BoardQuote, IndexQuote, ScreenerRow, Stock, SymbolInfo } from '../psx/types';
import { isMarketOpen } from '../market-hours';
import { loadCached, saveCached } from '../storage';

const LIVE_MS = 30_000;
const SCREENER_MS = 30 * 60_000;
const SYMBOLS_MS = 24 * 3600_000;

interface MarketState {
  ready: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
  marketOpen: boolean;
  indices: IndexQuote[];
  stocks: Stock[];
  bySymbol: Map<string, Stock>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<MarketState | null>(null);

export { mergeStocks } from '../psx/merge';
import { mergeStocks } from '../psx/merge';

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [screener, setScreener] = useState<ScreenerRow[]>([]);
  const [board, setBoard] = useState<BoardQuote[]>([]);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const screenerAt = useRef(0);
  const symbolsAt = useRef(0);
  const busy = useRef(false);
  const lastAt = useRef(0);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lastAt.current = Date.now();
    setRefreshing(true);
    setMarketOpen(isMarketOpen());
    try {
      const [idx, brd] = await Promise.all([fetchIndices(), fetchBoard()]);
      setIndices(idx);
      setBoard(brd);
      saveCached('psx.indices', idx);
      saveCached('psx.board', brd);
      setUpdatedAt(Date.now());
      setError(null);

      // The symbol list and screener are fetched together, and one failing doesn't skip the other
      // or show an error: prices already loaded, and the saved lists stay in use.
      const now = Date.now();
      await Promise.allSettled([
        now - symbolsAt.current > SYMBOLS_MS
          ? fetchSymbols().then((syms) => {
              if (!syms.length) return;
              setSymbols(syms);
              symbolsAt.current = now;
              saveCached('psx.symbols', syms);
            })
          : null,
        now - screenerAt.current > SCREENER_MS
          ? fetchScreener().then((scr) => {
              if (!scr.length) return;
              setScreener(scr);
              screenerAt.current = now;
              saveCached('psx.screener', scr);
            })
          : null,
      ]);
    } catch (e) {
      setError((e as Error).message || 'Could not reach PSX');
    } finally {
      busy.current = false;
      setRefreshing(false);
      setReady(true);
    }
  }, []);

  // Show the last saved snapshot instantly, then go to the network.
  useEffect(() => {
    (async () => {
      const [idx, brd, syms, scr] = await Promise.all([
        loadCached<IndexQuote[]>('psx.indices'),
        loadCached<BoardQuote[]>('psx.board'),
        loadCached<SymbolInfo[]>('psx.symbols'),
        loadCached<ScreenerRow[]>('psx.screener'),
      ]);
      if (idx) setIndices(idx.data);
      if (brd) {
        setBoard(brd.data);
        setUpdatedAt(brd.at);
      }
      if (syms) {
        setSymbols(syms.data);
        symbolsAt.current = syms.at;
      }
      if (scr) {
        setScreener(scr.data);
        screenerAt.current = scr.at;
      }
      if (brd || scr) setReady(true);
      refresh();
    })();
  }, [refresh]);

  // Poll while the app is in front and the market is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState === 'active' && isMarketOpen()) refresh();
      else setMarketOpen(isMarketOpen());
    }, LIVE_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // back in the app: prices move only while the market is open, so after the close
      // a quick look at the phone doesn't need another download
      const age = Date.now() - lastAt.current;
      if (isMarketOpen() ? age > 20_000 : age > 15 * 60_000) refresh();
      else setMarketOpen(isMarketOpen());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

  const stocks = useMemo(() => mergeStocks(symbols, screener, board), [symbols, screener, board]);
  const bySymbol = useMemo(() => new Map(stocks.map((s) => [s.symbol, s])), [stocks]);

  const value = useMemo(
    () => ({ ready, refreshing, error, updatedAt, marketOpen, indices, stocks, bySymbol, refresh }),
    [ready, refreshing, error, updatedAt, marketOpen, indices, stocks, bySymbol, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarket(): MarketState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMarket outside MarketProvider');
  return v;
}

export function useStock(symbol: string): Stock | undefined {
  return useMarket().bySymbol.get(symbol);
}
