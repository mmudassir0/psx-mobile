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

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, '&');
}

export function mergeStocks(symbols: SymbolInfo[], screener: ScreenerRow[], board: BoardQuote[]): Stock[] {
  const info = new Map(symbols.map((s) => [s.symbol, s]));
  const scr = new Map(screener.map((s) => [s.symbol, s]));
  const live = new Map(board.map((b) => [b.symbol, b]));
  const all = new Set<string>([...scr.keys(), ...live.keys()]);
  const out: Stock[] = [];
  for (const symbol of all) {
    const i = info.get(symbol);
    if (i?.isDebt) continue;
    const s = scr.get(symbol);
    const b = live.get(symbol);
    let price = b?.price ?? s?.price ?? null;
    let change = b?.change ?? null;
    let changePct = b?.changePct ?? s?.changePct ?? null;
    let ldcp = b?.ldcp ?? null;
    if (change == null && price != null && changePct != null && changePct > -100) {
      ldcp = Math.round((price / (1 + changePct / 100)) * 100) / 100;
      change = Math.round((price - ldcp) * 100) / 100;
    }
    out.push({
      symbol,
      name: i?.name ?? b?.name ?? symbol,
      sector: i?.sectorName ? titleCase(i.sectorName) : 'Other',
      price,
      change,
      changePct,
      ldcp,
      volume: b?.volume ?? null,
      shariah: s?.shariah ?? false,
      indexes: s?.indexes ?? [],
      marketCap: s?.marketCap ?? null,
      pe: s?.pe ?? null,
      divYield: s?.divYield ?? null,
      change1y: s?.change1y ?? null,
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

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

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
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

      const now = Date.now();
      if (now - symbolsAt.current > SYMBOLS_MS) {
        const syms = await fetchSymbols();
        if (syms.length) {
          setSymbols(syms);
          symbolsAt.current = now;
          saveCached('psx.symbols', syms);
        }
      }
      if (now - screenerAt.current > SCREENER_MS) {
        const scr = await fetchScreener();
        if (scr.length) {
          setScreener(scr);
          screenerAt.current = now;
          saveCached('psx.screener', scr);
        }
      }
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
      if (s === 'active') refresh();
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
