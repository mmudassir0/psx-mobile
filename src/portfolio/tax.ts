/**
 * Capital gains tax on PSX shares, as an estimate before you sell.
 *
 * Rates by when the shares were bought (Income Tax Ordinance s.37A as amended
 * by the Finance Acts 2024 and 2025; KPMG tax alert, 2025):
 *   bought from 1 July 2024      filer 15%; non-filer 30% (bought July 2024–June 2025)
 *                                or the normal income-tax slab rate (bought from July 2025)
 *   1 July 2022 – 30 June 2024   by holding period: under 1 year 15%, 1–2 years 12.5%,
 *                                2–3 years 10%, 3–4 years 7.5%, 4–5 years 5%, 5–6 years 2.5%, then 0%
 *   1 July 2013 – 30 June 2022   12.5%
 *   before 1 July 2013           0%
 * NCCPL works out and collects the tax through your broker. A loss on shares
 * can be set against share gains. Sahm doesn't know when you bought, so it
 * assumes the current rule (bought from July 2024) unless you say otherwise.
 */
import type { TaxStatus } from '../analysis/dividends';

export type Bought = 'recent' | '2022-24' | '2013-22' | 'pre2013';
export const BOUGHT_LABEL: Record<Bought, string> = {
  recent: 'From July 2024',
  '2022-24': 'July 2022 – June 2024',
  '2013-22': 'July 2013 – June 2022',
  pre2013: 'Before July 2013',
};

/** Non-filers who bought from July 2025 pay their slab rate; 30% is used as a typical figure. */
export const NONFILER_SLAB_GUESS = 0.3;

export function cgtRate(status: TaxStatus, bought: Bought = 'recent', heldYears = 0): { rate: number; note: string } {
  if (bought === 'pre2013') return { rate: 0, note: 'shares bought before July 2013 are not taxed on sale' };
  if (bought === '2013-22') return { rate: 0.125, note: '12.5% for shares bought July 2013 – June 2022' };
  if (bought === '2022-24') {
    const tiers = [0.15, 0.125, 0.1, 0.075, 0.05, 0.025];
    const rate = tiers[Math.floor(Math.max(0, heldYears))] ?? 0;
    return { rate, note: `${(rate * 100).toFixed(1).replace(/\.0$/, '')}% after holding about ${Math.floor(heldYears)} year${Math.floor(heldYears) === 1 ? '' : 's'} (bought July 2022 – June 2024)` };
  }
  if (status === 'filer') return { rate: 0.15, note: '15% as a filer' };
  return { rate: NONFILER_SLAB_GUESS, note: 'as a non-filer: 30% if bought by June 2025, else your income-tax slab rate (shown at 30%)' };
}

export interface SaleTax {
  proceeds: number;
  cost: number;
  gain: number;
  tax: number;
  keep: number;
  rate: number;
  note: string;
}

/** Selling `shares` at `price` with an average cost of `avgCost`. Brokerage and other charges aren't included. */
export function saleTax(shares: number, price: number, avgCost: number, status: TaxStatus, bought: Bought = 'recent', heldYears = 0): SaleTax {
  const proceeds = shares * price;
  const cost = shares * avgCost;
  const gain = proceeds - cost;
  const { rate, note } = cgtRate(status, bought, heldYears);
  const tax = gain > 0 ? gain * rate : 0;
  return { proceeds, cost, gain, tax, keep: proceeds - tax, rate, note };
}

/** Years held for shares bought July 2022 – June 2024, taken from the middle of that window when the date isn't known. */
export const heldSince2023 = (now = Date.now()) => (now - Date.UTC(2023, 6, 1)) / (365.25 * 864e5);

export function saleLine(t: SaleTax, fmt: (v: number) => string): string {
  if (t.gain <= 0)
    return `Selling at this price is a loss of Rs ${fmt(-t.gain)}, so no tax; the loss can be set against tax on other share gains. You'd get about Rs ${fmt(t.proceeds)}.`;
  return `Gain Rs ${fmt(t.gain)}, tax about Rs ${fmt(t.tax)} (${t.note}), so you'd keep about Rs ${fmt(t.keep)} of the Rs ${fmt(t.proceeds)}. Brokerage not included.`;
}
