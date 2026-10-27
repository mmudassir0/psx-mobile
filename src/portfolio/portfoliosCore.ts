/** Pure parts of family portfolios (no phone APIs, so the tests can use them). */
import type { Holding } from './review';

export interface PortfolioMeta {
  id: string;
  name: string;
}
export interface Portfolios {
  active: string;
  list: PortfolioMeta[];
}

export const isPortfolios = (v: unknown): v is Portfolios =>
  !!v && typeof v === 'object' && typeof (v as Portfolios).active === 'string' && Array.isArray((v as Portfolios).list) && (v as Portfolios).list.every((p) => typeof p.id === 'string' && typeof p.name === 'string');

/** Adds a portfolio (empty), returning the new list; names are kept unique. */
export function addPortfolio(p: Portfolios, name: string, now = Date.now()): Portfolios {
  const n = name.trim();
  if (!n || p.list.some((x) => x.name.toLowerCase() === n.toLowerCase())) return p;
  return { ...p, list: [...p.list, { id: `p${now}`, name: n }] };
}

export const renamePortfolio = (p: Portfolios, id: string, name: string): Portfolios =>
  name.trim() && !p.list.some((x) => x.id !== id && x.name.toLowerCase() === name.trim().toLowerCase()) ? { ...p, list: p.list.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) } : p;

/** Value and today's change of a list of holdings at given prices. */
export function valueOf(holdings: Holding[], price: (s: string) => { price: number | null; ldcp?: number | null; changePct?: number | null } | undefined) {
  let value = 0;
  let cost = 0;
  let today = 0;
  for (const h of holdings) {
    const q = price(h.symbol);
    const px = q?.price ?? 0;
    value += px * h.shares;
    cost += h.avgCost * h.shares;
    if (px && q?.changePct != null) today += px * h.shares * (1 - 1 / (1 + q.changePct / 100));
  }
  return { value, cost, pnl: value - cost, today };
}
