/**
 * More than one portfolio (yours, a parent's, a child's). The one in use lives in
 * the usual places, so every screen works on it unchanged; the others are kept
 * together under one key and swapped in when you switch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makePref, reloadAllPrefs } from '../prefs';
import { load, save } from '../storage';
import { setHoldings } from './holdings';
import { reloadSnapshots } from './track';
import type { Holding } from './review';
import type { Portfolios } from './portfoliosCore';
export * from './portfoliosCore';

/** What belongs to one portfolio. Settings, costs, keys and price alerts are shared. */
export const PORTFOLIO_KEYS = [
  'real.holdings',
  'real.appliedBonuses',
  'real.snapshots',
  'real.bought',
  'real.trades',
  'real.priceTargets',
  'real.notes',
  'real.goal',
  'real.goals',
  'real.monthlyPlan',
  'real.targets',
  'real.divReceived',
  'real.bonusLog',
] as const;

export const portfoliosPref = makePref<Portfolios>('ui.portfolios', { active: 'main', list: [{ id: 'main', name: 'Mine' }] });
export const STORE_KEY = 'pf.store';
type Store = Record<string, Partial<Record<(typeof PORTFOLIO_KEYS)[number], unknown>>>;

export const loadStore = () => load<Store>(STORE_KEY, {});

/** Moves the current portfolio's data into the store and brings `to`'s out. */
export async function switchPortfolio(to: string): Promise<void> {
  const p = await portfoliosPref.get();
  if (to === p.active || !p.list.some((x) => x.id === to)) return;
  const store = await loadStore();
  const mine: Store[string] = {};
  for (const k of PORTFOLIO_KEYS) {
    const raw = await AsyncStorage.getItem(k).catch(() => null);
    if (raw != null) mine[k] = JSON.parse(raw);
  }
  store[p.active] = mine;
  const next = store[to] ?? {};
  for (const k of PORTFOLIO_KEYS) {
    if (next[k] !== undefined) await save(k, next[k]);
    else await AsyncStorage.removeItem(k).catch(() => {});
  }
  delete store[to];
  await save(STORE_KEY, store);
  await portfoliosPref.set({ ...p, active: to });
  // everything already loaded takes the other portfolio now
  await setHoldings((next['real.holdings'] as Holding[] | undefined) ?? []);
  await reloadSnapshots();
  await reloadAllPrefs();
}

/** Deletes a portfolio that isn't in use. */
export async function deletePortfolio(id: string): Promise<void> {
  const p = await portfoliosPref.get();
  if (id === p.active || p.list.length < 2) return;
  const store = await loadStore();
  delete store[id];
  await save(STORE_KEY, store);
  await portfoliosPref.set({ ...p, list: p.list.filter((x) => x.id !== id) });
}

/** Each portfolio's holdings, the active one from `current`. */
export async function allHoldings(current: Holding[]): Promise<{ id: string; name: string; active: boolean; holdings: Holding[] }[]> {
  const p = await portfoliosPref.get();
  const store = await loadStore();
  return p.list.map((x) => ({ id: x.id, name: x.name, active: x.id === p.active, holdings: x.id === p.active ? current : ((store[x.id]?.['real.holdings'] as Holding[] | undefined) ?? []) }));
}
