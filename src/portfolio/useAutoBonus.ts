/** On Home: adds bonus shares that have settled, logged in the bonus log (with undo on the holding). */
import { useEffect } from 'react';
import { recentBonus } from '../analysis/dividends';
import { getHoldings, setHoldings } from './holdings';
import { appliedBonusesPref, bonusLogPref } from './prefs';
import { snapshots } from './track';
import { tradesPref } from './trades';
import { sharesFromTrades, snapshotLookup } from './taxStatement';
import { canUndo, dueBonuses, type BonusEntry } from './bonusAuto';
import type { Row } from './useReviews';

export async function applyDueBonuses(rows: Row[]): Promise<BonusEntry[]> {
  const holdings = await getHoldings();
  const [applied, trades, snaps] = await Promise.all([appliedBonusesPref.get(), tradesPref.get(), snapshots()]);
  const fromSnaps = snapshotLookup(snaps);
  const due = dueBonuses({
    holdings,
    bonuses: Object.fromEntries(rows.map((r) => [r.holding.symbol, recentBonus(r.dividends)])),
    applied,
    sharesOn: (s, d) => sharesFromTrades(trades, s, d, holdings.find((h) => h.symbol === s)?.shares ?? 0) ?? (snaps.length && snaps[0].day <= d ? fromSnaps(s, d) : null),
    now: Date.now(),
  });
  if (!due.length) return [];
  await setHoldings(
    holdings.map((h) => {
      const e = due.find((x) => x.symbol === h.symbol);
      return e ? { ...h, ...e.after } : h;
    }),
  );
  await appliedBonusesPref.set([...applied, ...due.map((e) => e.key)]);
  await bonusLogPref.set([...(await bonusLogPref.get()), ...due].slice(-200));
  return due;
}

export async function undoBonus(e: BonusEntry): Promise<boolean> {
  const holdings = await getHoldings();
  const h = holdings.find((x) => x.symbol === e.symbol);
  if (!canUndo(e, h)) return false;
  await setHoldings(holdings.map((x) => (x.symbol === e.symbol ? { ...x, ...e.before } : x)));
  // stays in "applied" so it isn't added again by itself; the log keeps the undo
  await bonusLogPref.set((await bonusLogPref.get()).filter((x) => !(x.key === e.key && x.at === e.at)));
  return true;
}

export function useAutoBonus(rows: Row[], ready: boolean) {
  const sig = rows.map((r) => `${r.holding.symbol}:${r.dividends?.list.length ?? 0}`).join('|');
  useEffect(() => {
    if (!ready) return;
    applyDueBonuses(rows).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig]);
}
