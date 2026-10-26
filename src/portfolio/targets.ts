/**
 * Your own two prices for a holding: a target (where you'd take profit or at
 * least look again) and a rethink price (where the reason for owning it may
 * be broken). Saving them also adds matching evening price alerts.
 */
import { makePref } from '../prefs';
import type { WatchRule } from '../analysis/watch';

export interface PriceTargets {
  target: number | null;
  rethink: number | null;
}

export const targetsPref = makePref<Record<string, PriceTargets>>('real.priceTargets', {});

/** Where the price sits from rethink (0) to target (1); outside that it goes below 0 or above 1. */
export function position(price: number, t: PriceTargets): number | null {
  if (t.target == null || t.rethink == null || !(t.target > t.rethink)) return null;
  return (price - t.rethink) / (t.target - t.rethink);
}

export type TargetState = 'reached' | 'broken' | 'between' | null;
export function stateOf(price: number, t: PriceTargets | undefined): TargetState {
  if (!t || !(price > 0)) return null;
  if (t.target != null && price >= t.target) return 'reached';
  if (t.rethink != null && price <= t.rethink) return 'broken';
  return t.target != null || t.rethink != null ? 'between' : null;
}

/** The price alert rules with the old targets of `symbol` swapped for the new ones. */
export function withTargetRules(rules: WatchRule[], symbol: string, old: PriceTargets | undefined, next: PriceTargets): WatchRule[] {
  const isOld = (r: WatchRule) => r.symbol === symbol && !r.yield && ((r.dir === '>' && r.level === old?.target) || (r.dir === '<' && r.level === old?.rethink));
  const kept = rules.filter((r) => !isOld(r));
  const add: WatchRule[] = [];
  if (next.target != null) add.push({ symbol, dir: '>', level: next.target });
  if (next.rethink != null) add.push({ symbol, dir: '<', level: next.rethink });
  return [...kept.filter((r) => !add.some((a) => a.symbol === r.symbol && a.dir === r.dir && a.level === r.level)), ...add];
}
