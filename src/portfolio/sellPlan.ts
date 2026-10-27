/**
 * Before you sell: what you'd actually have in hand after the trading charges and
 * capital gains tax, and the same if you held on through the next dividend and sold
 * after the ex-date (when the price usually drops by about the dividend).
 */
import { saleTax, type Bought } from './tax';
import { tradeCost, type CostSettings, DEFAULT_COSTS } from './costs';
import type { TaxStatus } from '../analysis/dividends';

export interface SaleOutcome {
  price: number;
  proceeds: number;
  costs: number;
  gain: number;
  tax: number;
  rate: number;
  note: string;
  /** dividend after tax, when holding through it */
  dividend: number;
  inHand: number;
}

export interface SellPlan {
  now: SaleOutcome;
  /** hold through the next cash dividend, then sell at the price less the dividend */
  wait: (SaleOutcome & { sellFrom: number; bookClosure: number; dps: number; diff: number }) | null;
  /** the lowest price that gets back what you paid, after this sale's charges and tax */
  evenPrice: number;
}

export interface SellInput {
  shares: number;
  price: number;
  avgCost: number;
  status: TaxStatus;
  bought?: Bought;
  heldYears?: number;
  costs?: CostSettings;
  /** the next cash dividend not yet past its ex-date */
  payout?: { dps: number; bookClosure: number; exDate: number } | null;
  /** dividend withholding tax rate, 0–1 */
  divRate: number;
}

function outcome(i: SellInput, price: number, dividend: number): SaleOutcome {
  const t = saleTax(i.shares, price, i.avgCost, i.status, i.bought ?? 'recent', i.heldYears ?? 0);
  const costs = tradeCost(i.shares, price, i.costs ?? DEFAULT_COSTS).total;
  return { price, proceeds: t.proceeds, costs, gain: t.gain, tax: t.tax, rate: t.rate, note: t.note, dividend, inHand: t.proceeds - costs - t.tax + dividend };
}

export function sellPlan(i: SellInput): SellPlan | null {
  if (!(i.shares > 0 && i.price > 0)) return null;
  const now = outcome(i, i.price, 0);
  let wait: SellPlan['wait'] = null;
  const p = i.payout;
  if (p && p.dps > 0 && p.dps < i.price) {
    const w = outcome(i, i.price - p.dps, i.shares * p.dps * (1 - i.divRate));
    wait = { ...w, sellFrom: p.exDate, bookClosure: p.bookClosure, dps: p.dps, diff: w.inHand - now.inHand };
  }
  // price at which in-hand equals what the shares cost
  const paid = i.shares * i.avgCost;
  let lo = 0;
  let hi = Math.max(i.price, i.avgCost) * 2 + 1;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (outcome(i, mid, 0).inHand >= paid) hi = mid;
    else lo = mid;
  }
  return { now, wait, evenPrice: hi };
}

/** Shares for a quick choice ("a quarter", "half", "all"), whole shares, at least 1. */
export const portion = (held: number, f: number) => Math.max(1, Math.min(held, Math.round(held * f)));
