/**
 * Backtests are worked out once per strategy and data file, and shared: Home's
 * lab card, the follow reminders and the result screen ask for the same one.
 * Pure (no React Native).
 */
import type { Lab } from './data';
import { runBacktest, type Result, type Strategy } from './engine';

const byLab = new WeakMap<Lab, Map<string, Result>>();
/** told about a backtest that took long (the app logs it, to find slow phones and strategies) */
let slow: ((ms: number, st: Strategy) => void) | null = null;
export const onSlowRun = (f: (ms: number, st: Strategy) => void) => (slow = f);
const MAX = 24;

/** A short, stable key for a strategy's rules and money (not its id or name). */
export function strategyKey(st: Strategy): string {
  const { id: _i, name: _n, ...rules } = st;
  const json = JSON.stringify(rules, Object.keys(rules).sort());
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + json.length.toString(36);
}

/** The backtest of `st`, from the cache when it's been run on this data already. */
export function runCached(lab: Lab, st: Strategy): Result {
  let m = byLab.get(lab);
  if (!m) byLab.set(lab, (m = new Map()));
  const key = strategyKey(st);
  const hit = m.get(key);
  if (hit) {
    // most recently used last
    m.delete(key);
    m.set(key, hit);
    return hit;
  }
  const t0 = Date.now();
  const r = runBacktest(lab, st);
  const ms = Date.now() - t0;
  if (ms > 2500 && slow) slow(ms, st);
  m.set(key, r);
  if (m.size > MAX) m.delete(m.keys().next().value as string);
  return r;
}
