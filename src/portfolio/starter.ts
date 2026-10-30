/**
 * A first portfolio for someone starting out: given the cash at the broker, which companies and how many
 * shares of each. Rules, kept simple enough to explain on screen:
 *  - only large, established, profitable companies from the KSE-100 (KMI-30 / Shariah KSE-100 when asked),
 *    paying a dividend, with a P/E under 30 and traded today
 *  - one company per sector, so the money is spread across the economy
 *  - the number of companies grows with the money, so each one is worth buying after fees (about Rs 10,000+)
 *  - under Rs 25,000, one index fund (ETF) instead: a whole index in a single buy
 *  - an even split, in whole shares, with brokerage, tax and PSX/CDC fees counted; what's left stays as cash
 * Information to act on yourself, not advice: the screen says so.
 */
import type { Stock } from '../psx/types';
import { DEFAULT_COSTS, tradeCost, type CostSettings } from './costs';

export interface StarterLine {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  shares: number;
  /** shares × price */
  amount: number;
  /** charges on the buy */
  cost: number;
  why: string;
}

export interface StarterPlan {
  lines: StarterLine[];
  /** shares and charges together */
  spent: number;
  fees: number;
  /** cash not placed */
  left: number;
  /** one index fund instead of companies */
  etf: boolean;
  /** how many companies the money was spread across, and why that many */
  note: string;
}

/** How many companies the money stretches to while keeping each one worth its fees. */
export function companiesFor(amount: number): number {
  if (amount < 25_000) return 1;
  if (amount < 60_000) return 3;
  if (amount < 150_000) return 5;
  if (amount < 500_000) return 7;
  return 10;
}

const isEtf = (s: Stock) => /exchange traded/i.test(s.sector) || /ETF$/.test(s.symbol);

export function starterPlan(stocks: Stock[], amount: number, opts: { shariah: boolean; costs?: CostSettings }): StarterPlan | null {
  const costs = opts.costs ?? DEFAULT_COSTS;
  if (!(amount > 0)) return null;
  const n = companiesFor(amount);
  const empty = (note: string): StarterPlan => ({ lines: [], spent: 0, fees: 0, left: amount, etf: false, note });

  // small amounts: one index fund
  if (n === 1) {
    const etfs = stocks.filter((s) => isEtf(s) && (s.price ?? 0) > 0 && (s.volume ?? 0) > 0 && (!opts.shariah || s.shariah)).sort((a, b) => (b.volume ?? 0) * (b.price ?? 0) - (a.volume ?? 0) * (a.price ?? 0));
    const f = etfs[0];
    if (f && f.price! <= amount) {
      const lines = fill([{ s: f, why: `An index fund: one buy holds ${opts.shariah ? 'a basket of Shariah-compliant' : 'a basket of the biggest'} PSX companies, so even a small amount is spread out.` }], amount, costs);
      return summarise(lines, amount, true, `Under Rs 25,000, one fund spreads the money better than one or two companies would.`);
    }
    // no fund trading today: fall back to the two biggest companies
  }

  const inIndex = (s: Stock) => (opts.shariah ? s.indexes.includes('KMI30') || (s.shariah && s.indexes.includes('KSE100')) : s.indexes.includes('KSE100'));
  const pool = stocks
    .filter((s) => !isEtf(s) && inIndex(s) && (s.price ?? 0) > 0 && (s.marketCap ?? 0) > 0 && s.pe != null && s.pe > 0 && s.pe < 30 && (s.divYield ?? 0) > 0 && (s.volume ?? 0) > 0)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  if (!pool.length) return empty('No companies fit right now (prices still loading?).');

  const want = Math.max(2, n);
  const target = amount / want;
  const picked: Stock[] = [];
  const sectors = new Set<string>();
  // biggest first, one per sector, and only if about three shares fit its share of the money
  // (a Rs 7,000 share in a Rs 20,000 slot leaves the split lopsided)
  const fits = (s: Stock) => s.price! <= target / 3;
  for (const s of pool) {
    if (picked.length >= want) break;
    if (sectors.has(s.sector) || !fits(s)) continue;
    picked.push(s);
    sectors.add(s.sector);
  }
  // not enough sectors: allow a second company from one already in
  for (const s of pool) {
    if (picked.length >= want) break;
    if (!picked.includes(s) && fits(s)) picked.push(s);
  }
  if (!picked.length) return empty('Every suitable share costs more than this amount allows; add more cash or start with an index fund.');

  const lines = fill(
    picked.map((s) => ({
      s,
      why: `P/E ${s.pe!.toFixed(1)} · ${(s.divYield! * (s.divYield! < 1 ? 100 : 1)).toFixed(1)}% dividend yield`,
    })),
    amount,
    costs,
  );
  return summarise(
    lines,
    amount,
    false,
    `Rs ${Math.round(amount).toLocaleString('en-US')} spreads across ${lines.length} of the biggest ${opts.shariah ? 'Shariah-compliant ' : ''}companies on PSX, about Rs ${Math.round(amount / lines.length).toLocaleString('en-US')} each, one per sector.`,
  );
}

/** Even split in whole shares with fees counted; leftover money buys extra shares where it fits, smallest holding first. */
function fill(items: { s: Stock; why: string }[], amount: number, costs: CostSettings): StarterLine[] {
  const lines: StarterLine[] = items.map(({ s, why }) => ({ symbol: s.symbol, name: s.name, sector: s.sector, price: s.price!, shares: 0, amount: 0, cost: 0, why }));
  const total = () => lines.reduce((a, l) => a + l.amount + l.cost, 0);
  const each = amount / lines.length;
  for (const l of lines) {
    let k = Math.floor(each / l.price);
    while (k > 0 && k * l.price + tradeCost(k, l.price, costs).total > each) k--;
    l.shares = k;
    l.amount = k * l.price;
    l.cost = k ? tradeCost(k, l.price, costs).total : 0;
  }
  // spend what's left, one share at a time, on the line furthest below its even share
  for (let guard = 0; guard < 10_000; guard++) {
    const left = amount - total();
    const next = [...lines]
      .sort((a, b) => a.amount - b.amount)
      .find((l) => {
        const c = tradeCost(l.shares + 1, l.price, costs).total - l.cost;
        return l.price + c <= left;
      });
    if (!next) break;
    next.shares += 1;
    next.amount = next.shares * next.price;
    next.cost = tradeCost(next.shares, next.price, costs).total;
  }
  return lines.filter((l) => l.shares > 0);
}

function summarise(lines: StarterLine[], amount: number, etf: boolean, note: string): StarterPlan {
  const fees = lines.reduce((a, l) => a + l.cost, 0);
  const spent = lines.reduce((a, l) => a + l.amount, 0) + fees;
  return { lines, spent, fees, left: Math.max(0, amount - spent), etf, note };
}
