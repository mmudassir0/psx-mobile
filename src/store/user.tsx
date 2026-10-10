import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Account,
  cancelOrder as cancelOrderFn,
  newAccount,
  OrderInput,
  placeOrder as placeOrderFn,
  PlaceResult,
  processOpenOrders,
} from '../paper/engine';
import { load, save } from '../storage';
import { useMarket } from './market';

const DEFAULT_WATCHLIST = ['LUCK', 'MEBL', 'SYS', 'ENGRO', 'HUBC', 'OGDC'];

interface UserState {
  loaded: boolean;
  name: string | null;
  setName: (n: string) => void;
  watchlist: string[];
  isWatched: (s: string) => boolean;
  toggleWatch: (s: string) => void;
  account: Account;
  placeOrder: (input: OrderInput) => PlaceResult;
  cancelOrder: (id: string) => void;
  resetAccount: () => void;
}

const Ctx = createContext<UserState | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { bySymbol, updatedAt } = useMarket();
  const [loaded, setLoaded] = useState(false);
  const [name, setNameState] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [account, setAccount] = useState<Account>(() => newAccount());
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    (async () => {
      const [n, w, a] = await Promise.all([
        load<string | null>('user.name', null),
        load<string[]>('user.watchlist', DEFAULT_WATCHLIST),
        load<Account | null>('paper.account', null),
      ]);
      setNameState(n);
      setWatchlist(w);
      if (a) setAccount(a);
      setLoaded(true);
    })();
  }, []);

  const commit = useCallback((next: Account) => {
    accountRef.current = next;
    setAccount(next);
    save('paper.account', next);
  }, []);

  // Every price refresh: check open limit / stop orders.
  useEffect(() => {
    if (!loaded || !updatedAt) return;
    const acc = accountRef.current;
    if (!acc.orders.some((o) => o.status === 'open')) return;
    const next = processOpenOrders(acc, (s) => bySymbol.get(s)?.price ?? null);
    if (next !== acc) commit(next);
  }, [updatedAt, bySymbol, loaded, commit]);

  const setName = useCallback((n: string) => {
    setNameState(n);
    save('user.name', n);
  }, []);

  const toggleWatch = useCallback((s: string) => {
    setWatchlist((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      save('user.watchlist', next);
      return next;
    });
  }, []);

  const placeOrder = useCallback(
    (input: OrderInput) => {
      const result = placeOrderFn(accountRef.current, input, bySymbol.get(input.symbol)?.price ?? null);
      if (result.ok) commit(result.account);
      return result;
    },
    [bySymbol, commit],
  );

  const cancelOrder = useCallback((id: string) => commit(cancelOrderFn(accountRef.current, id)), [commit]);
  const resetAccount = useCallback(() => commit(newAccount()), [commit]);

  const value = useMemo(
    () => ({
      loaded,
      name,
      setName,
      watchlist,
      isWatched: (s: string) => watchlist.includes(s),
      toggleWatch,
      account,
      placeOrder,
      cancelOrder,
      resetAccount,
    }),
    [loaded, name, setName, watchlist, toggleWatch, account, placeOrder, cancelOrder, resetAccount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser(): UserState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUser outside UserProvider');
  return v;
}
