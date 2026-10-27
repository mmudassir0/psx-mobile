/** Your real holdings, kept on the phone only. */
import { useEffect, useState } from 'react';
import { load, save } from '../storage';
import type { Holding } from './review';

const KEY = 'real.holdings';
let current: Holding[] | null = null;
const listeners = new Set<(h: Holding[]) => void>();

async function ensure(): Promise<Holding[]> {
  if (current) return current;
  current = await load<Holding[]>(KEY, []);
  return current;
}

/** The holdings as saved (for code outside a screen). */
export const getHoldings = () => ensure();

export async function setHoldings(h: Holding[]) {
  current = [...h].sort((a, b) => a.symbol.localeCompare(b.symbol));
  await save(KEY, current);
  listeners.forEach((f) => f(current!));
}

export function holdingsText(h: Holding[]): string {
  return h.map((x) => `${x.symbol} ${x.shares} ${x.avgCost}`).join('\n');
}

export function useHoldings(): { holdings: Holding[]; loaded: boolean } {
  const [h, setH] = useState<Holding[] | null>(current);
  useEffect(() => {
    let alive = true;
    ensure().then((v) => alive && setH(v));
    const f = (v: Holding[]) => setH(v);
    listeners.add(f);
    return () => {
      alive = false;
      listeners.delete(f);
    };
  }, []);
  return { holdings: h ?? [], loaded: h != null };
}

export interface Trade {
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
}

/**
 * Applies a buy or sell to the holdings. A buy updates the average price; a
 * sell reduces shares (the average stays, as brokers show it) and removes the
 * holding when none are left. Returns the realised profit of a sell.
 */
export function applyTrade(h: Holding[], t: Trade): { holdings: Holding[]; realised: number | null; error: string | null } {
  const sym = t.symbol.trim().toUpperCase();
  if (!sym || !(t.shares > 0) || !(t.price > 0)) return { holdings: h, realised: null, error: 'Enter a symbol, shares and price' };
  const cur = h.find((x) => x.symbol === sym);
  if (t.side === 'buy') {
    const shares = (cur?.shares ?? 0) + t.shares;
    const avgCost = cur ? (cur.shares * cur.avgCost + t.shares * t.price) / shares : t.price;
    const next = [...h.filter((x) => x.symbol !== sym), { symbol: sym, shares, avgCost: Math.round(avgCost * 100) / 100 }];
    return { holdings: next, realised: null, error: null };
  }
  if (!cur) return { holdings: h, realised: null, error: `You don't hold ${sym}` };
  if (t.shares > cur.shares) return { holdings: h, realised: null, error: `You hold only ${cur.shares} ${sym}` };
  const left = cur.shares - t.shares;
  const next = h.filter((x) => x.symbol !== sym).concat(left > 0 ? [{ ...cur, shares: left }] : []);
  return { holdings: next, realised: (t.price - cur.avgCost) * t.shares, error: null };
}

/**
 * A bonus issue: shares go up by the bonus percentage (fractions are paid in
 * cash, so they're dropped) and the average price falls so the total cost is
 * unchanged.
 */
export function applyBonus(h: Holding[], symbol: string, bonusPct: number): Holding[] {
  const cur = h.find((x) => x.symbol === symbol);
  if (!cur || !(bonusPct > 0)) return h;
  const shares = Math.floor(cur.shares * (1 + bonusPct / 100));
  if (shares <= cur.shares) return h; // under one whole share: the fraction is paid in cash
  const avgCost = Math.round(((cur.shares * cur.avgCost) / shares) * 100) / 100;
  return h.map((x) => (x.symbol === symbol ? { ...x, shares, avgCost } : x));
}
