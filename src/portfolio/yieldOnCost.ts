/**
 * Yield on cost: the last 12 months' dividends against what you paid for the
 * shares, next to the yield a buyer gets today. A holding bought cheaply years
 * ago can pay far more on your money than its current yield shows.
 */
export interface YocIn {
  symbol: string;
  shares: number;
  avgCost: number;
  price: number;
  /** dividends per share over the last 12 months */
  dps: number;
  /** tax taken off dividends, 0..1 */
  tax: number;
}
export interface YocRow {
  symbol: string;
  onCost: number;
  onCostNet: number;
  now: number;
  /** Rs a year after tax */
  income: number;
}

export function yieldOnCost(list: YocIn[]): { rows: YocRow[]; onCost: number | null; onCostNet: number | null; now: number | null } {
  const rows = list
    .filter((x) => x.dps > 0 && x.avgCost > 0 && x.shares > 0)
    .map((x) => ({ symbol: x.symbol, onCost: x.dps / x.avgCost, onCostNet: (x.dps * (1 - x.tax)) / x.avgCost, now: x.price > 0 ? x.dps / x.price : 0, income: x.dps * x.shares * (1 - x.tax) }))
    .sort((a, b) => b.onCost - a.onCost);
  const cost = list.reduce((a, x) => a + (x.avgCost > 0 ? x.shares * x.avgCost : 0), 0);
  const value = list.reduce((a, x) => a + x.shares * x.price, 0);
  const gross = list.reduce((a, x) => a + x.dps * x.shares, 0);
  const net = list.reduce((a, x) => a + x.dps * x.shares * (1 - x.tax), 0);
  return { rows, onCost: cost ? gross / cost : null, onCostNet: cost ? net / cost : null, now: value ? gross / value : null };
}
