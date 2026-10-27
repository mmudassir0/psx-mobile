/**
 * Averaging down: shares to buy at today's price to bring your average cost to a
 * level you choose, what that costs (with the trading charges), and the other
 * way round, what a given amount of money would do to the average.
 */
import { tradeCost, DEFAULT_COSTS, type CostSettings } from './costs';

export interface AveragePlan {
  shares: number;
  cost: number;
  charges: number;
  newAvg: number;
  newShares: number;
  /** share of the holding's value after the buy, 0–1, against the whole portfolio */
  weightAfter: number | null;
}

/** New average after buying `n` at `price`, charges counted in the cost as brokers' statements do. */
export function averageAfter(held: number, avg: number, n: number, price: number, costs: CostSettings = DEFAULT_COSTS): number {
  if (!(n > 0)) return avg;
  const c = tradeCost(n, price, costs).total;
  return (held * avg + n * price + c) / (held + n);
}

function plan(held: number, avg: number, n: number, price: number, costs: CostSettings, portfolio?: number): AveragePlan {
  const charges = tradeCost(n, price, costs).total;
  const value = (held + n) * price;
  return { shares: n, cost: n * price + charges, charges, newAvg: averageAfter(held, avg, n, price, costs), newShares: held + n, weightAfter: portfolio ? value / (portfolio + n * price + charges) : null };
}

/** Shares needed to bring the average down to `target`; null when it can't be done (target at or below the price, or above today's average). */
export function sharesForAverage(held: number, avg: number, price: number, target: number, costs: CostSettings = DEFAULT_COSTS, portfolio?: number): AveragePlan | null {
  if (!(held > 0 && price > 0) || target >= avg || target <= price * (1 + costs.brokerage * 1.3)) return null;
  // start from the plain formula, then step up until the charges are covered too
  let n = Math.max(1, Math.ceil((held * (avg - target)) / (target - price)));
  for (let k = 0; k < 10000 && averageAfter(held, avg, n, price, costs) > target + 1e-9; k++) n = Math.ceil(n * 1.002) + 1;
  // and back down to the fewest shares that still get there
  let lo = 1;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (averageAfter(held, avg, mid, price, costs) <= target + 1e-9) hi = mid;
    else lo = mid + 1;
  }
  return plan(held, avg, hi, price, costs, portfolio);
}

/** What `money` (charges included) buys and where the average lands. */
export function averageWithMoney(held: number, avg: number, price: number, money: number, costs: CostSettings = DEFAULT_COSTS, portfolio?: number): AveragePlan | null {
  if (!(price > 0 && money > 0)) return null;
  let n = Math.floor(money / price);
  while (n > 0 && n * price + tradeCost(n, price, costs).total > money) n--;
  return n > 0 ? plan(held, avg, n, price, costs, portfolio) : null;
}

/** Suggested targets between today's price and average: a quarter, half and three quarters of the way down. */
export function targetSteps(avg: number, price: number): number[] {
  if (!(price < avg)) return [];
  return [0.25, 0.5, 0.75].map((f) => Math.round((avg - (avg - price) * f) * 100) / 100);
}
