/**
 * Rebalance to your own target weights, in whole shares.
 *
 * - New money only: the cash goes to the holdings furthest below target,
 *   nothing is sold. With too little cash to reach every target, each gets a
 *   share of it in proportion to how far below it is.
 * - Buy and sell: holdings above target are trimmed back to it, and the cash
 *   from that (plus any new money) buys the ones below.
 *
 * Whole shares only, so a little cash is usually left over.
 */
import { makePref } from '../prefs';

/** symbol → target %, as you typed it (scaled to 100 when used) */
export const targetsPref = makePref<Record<string, number>>('real.targets', {});

export interface Position {
  symbol: string;
  shares: number;
  price: number;
}

export interface Trade {
  symbol: string;
  /** + buy, − sell */
  shares: number;
  price: number;
  value: number;
}

export interface RebalanceResult {
  trades: Trade[];
  /** symbol → weight after the trades (0–1) */
  before: Record<string, number>;
  after: Record<string, number>;
  /** cash not used */
  leftover: number;
  /** largest gap from target after the trades, in percentage points */
  maxGap: number;
}

/** Targets scaled to add up to 1; symbols without a target get 0. */
export function normalise(targets: Record<string, number>, symbols: string[]): Record<string, number> {
  const sum = symbols.reduce((a, s) => a + Math.max(0, targets[s] ?? 0), 0);
  return Object.fromEntries(symbols.map((s) => [s, sum > 0 ? Math.max(0, targets[s] ?? 0) / sum : 0]));
}

export function rebalance(positions: Position[], targets: Record<string, number>, cash: number, allowSell: boolean): RebalanceResult {
  const pos = positions.filter((p) => p.price > 0);
  const syms = pos.map((p) => p.symbol);
  const w = normalise(targets, syms);
  const shares = new Map(pos.map((p) => [p.symbol, p.shares]));
  const price = new Map(pos.map((p) => [p.symbol, p.price]));
  const value = (s: string) => shares.get(s)! * price.get(s)!;
  const invested = () => syms.reduce((a, s) => a + value(s), 0);
  const weights = (extra = 0) => {
    const t = invested() + extra;
    return Object.fromEntries(syms.map((s) => [s, t > 0 ? value(s) / t : 0]));
  };
  const before = weights();
  let left = Math.max(0, cash);
  const total = invested() + left;
  const ideal = (s: string) => total * w[s];

  // 1. trim what's above target (whole shares, never below the target)
  if (allowSell) {
    for (const s of syms) {
      const over = value(s) - ideal(s);
      const n = Math.floor(over / price.get(s)!);
      if (n > 0) {
        shares.set(s, shares.get(s)! - n);
        left += n * price.get(s)!;
      }
    }
  }

  // 2. buy what's below target: in proportion to the gap, then share by share with what's left
  const gap = (s: string) => Math.max(0, ideal(s) - value(s));
  const gaps = syms.map(gap);
  const need = gaps.reduce((a, g) => a + g, 0);
  if (need > 0 && left > 0) {
    const scale = Math.min(1, left / need);
    for (let i = 0; i < syms.length; i++) {
      const s = syms[i];
      const n = Math.floor((gaps[i] * scale) / price.get(s)!);
      if (n > 0) {
        shares.set(s, shares.get(s)! + n);
        left -= n * price.get(s)!;
      }
    }
  }
  for (let k = 0; k < 2000; k++) {
    // the holding furthest below target (as a share of its target) that one more share of fits
    let pick: string | null = null;
    let worst = 0;
    for (const s of syms) {
      if (price.get(s)! > left + 1e-9 || !(w[s] > 0)) continue;
      const short = (ideal(s) - value(s)) / (total * w[s]);
      if (short > worst + 1e-12) {
        worst = short;
        pick = s;
      }
    }
    // stop once one more share would overshoot by more than it helps
    if (!pick || ideal(pick) - value(pick) < price.get(pick)! / 2) break;
    shares.set(pick, shares.get(pick)! + 1);
    left -= price.get(pick)!;
  }

  const trades: Trade[] = [];
  for (const p of pos) {
    const d = shares.get(p.symbol)! - p.shares;
    if (d) trades.push({ symbol: p.symbol, shares: d, price: p.price, value: d * p.price });
  }
  trades.sort((a, b) => a.value - b.value); // sells first: their cash pays for the buys
  const after = weights();
  const maxGap = Math.max(0, ...syms.map((s) => Math.abs(after[s] - w[s]) * 100));
  return { trades, before, after, leftover: left, maxGap };
}
