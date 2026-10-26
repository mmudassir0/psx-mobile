/**
 * What a PSX trade really costs, and the price a buy has to reach before it
 * is in profit once the sale's costs are paid too.
 *
 * Charges on each buy and each sell (PSX schedule, as listed July 2026):
 *   brokerage        your broker's rate (at least 0.15%, or Rs 0.03 a share under Rs 20)
 *   sales tax        on brokerage and the PSX trading fee: 16% Punjab, 13% Sindh
 *   PSX              trading fee Rs 3.50 + regulatory fee Rs 0.62 per Rs 100,000
 *   SECP levy        0.00065%
 *   NCCPL            Rs 0.81 + Rs 0.30 per Rs 100,000
 *   CDC              0.0036%, at least Rs 5
 * Capital gains tax on a sale is separate (see tax.ts).
 */
import { makePref } from '../prefs';

export interface CostSettings {
  /** brokerage as a fraction of the trade, e.g. 0.0015 */
  brokerage: number;
  /** minimum brokerage per share for shares under Rs 20 */
  minPerShare: number;
  /** sales tax on services: 0.16 Punjab, 0.13 Sindh */
  salesTax: number;
}

export const DEFAULT_COSTS: CostSettings = { brokerage: 0.0015, minPerShare: 0.03, salesTax: 0.16 };
export const costsPref = makePref<CostSettings>('real.costs', DEFAULT_COSTS);

const PER_LAKH = 1e5;
export const FEES = {
  psxTrading: 3.5 / PER_LAKH,
  psxRegulatory: 0.62 / PER_LAKH,
  secp: 0.0000065,
  nccpl: (0.81 + 0.3) / PER_LAKH,
  cdc: 0.000036,
  cdcMin: 5,
};

export interface TradeCost {
  value: number;
  brokerage: number;
  salesTax: number;
  /** PSX, SECP, NCCPL and CDC together */
  exchange: number;
  total: number;
  /** total as a share of the trade */
  pct: number;
}

/** The charges on one buy or one sell of `shares` at `price`. */
export function tradeCost(shares: number, price: number, s: CostSettings = DEFAULT_COSTS): TradeCost {
  const value = shares * price;
  if (!(value > 0)) return { value: 0, brokerage: 0, salesTax: 0, exchange: 0, total: 0, pct: 0 };
  const brokerage = Math.max(value * s.brokerage, price < 20 ? shares * s.minPerShare : 0);
  const psxTrading = value * FEES.psxTrading;
  const salesTax = (brokerage + psxTrading) * s.salesTax;
  const exchange = psxTrading + value * (FEES.psxRegulatory + FEES.secp + FEES.nccpl) + Math.max(FEES.cdcMin, value * FEES.cdc);
  const total = brokerage + salesTax + exchange;
  return { value, brokerage, salesTax, exchange, total, pct: total / value };
}

/**
 * The lowest sale price at which a buy at `price` comes out even once the
 * charges on both the buy and the sale are paid (no gain, so no capital gains
 * tax). Found by bisection, since the charges step at Rs 20 and the CDC minimum.
 */
export function breakEven(shares: number, price: number, s: CostSettings = DEFAULT_COSTS): number {
  if (!(shares > 0 && price > 0)) return 0;
  const paid = shares * price + tradeCost(shares, price, s).total;
  const net = (p: number) => shares * p - tradeCost(shares, p, s).total;
  let lo = price;
  let hi = price * 1.5 + 1;
  while (net(hi) < paid) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (net(mid) >= paid) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}
