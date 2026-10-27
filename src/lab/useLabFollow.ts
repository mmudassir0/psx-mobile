/** Home's reminder for a followed lab strategy: on check days, what it holds now and which you don't own. */
import { useEffect, useState } from 'react';
import { remind, cancelReminder, ensureReady } from '../notify';
import type { TodoItem } from '../portfolio/summary';
import { runBacktest } from './engine';
import { checkDue, followPlan, nextCheck } from './follow';
import { findStrategy, labFollowPref, labStrategiesPref, loadLab } from './store';

export function useLabFollow(owned: string[], enabled: boolean): TodoItem[] {
  const follow = labFollowPref.use();
  const mine = labStrategiesPref.use();
  const [items, setItems] = useState<TodoItem[]>([]);
  const key = owned.join(',');
  useEffect(() => {
    if (!enabled || !follow) {
      setItems([]);
      if (!follow) cancelReminder('lab-check').catch(() => {});
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const st = findStrategy(follow.id, mine);
      const lab = st ? await loadLab().catch(() => null) : null;
      if (!alive || !st || !lab) return;
      const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
      const next = nextCheck(lab, st, today);
      if (await ensureReady(false))
        remind('lab-check', new Date(Date.parse(`${next}T09:30:00+05:00`)), `${st.name}: check day`, 'See what your lab strategy would hold now, and what to buy or sell to match it.', 'sahm://lab');
      if (!checkDue(lab, st, today)) return setItems([]);
      const r = runBacktest(lab, st);
      const p = followPlan(r.lastPicks, owned);
      if (!alive) return;
      setItems([
        {
          key: `lab-${st.id}-${today.slice(0, 7)}`,
          text: p.missing.length
            ? `${st.name} check: it now picks ${r.lastPicks.slice(0, 5).join(', ')}${r.lastPicks.length > 5 ? '…' : ''}; you don't own ${p.missing.slice(0, 4).join(', ')}${p.missing.length > 4 ? '…' : ''}`
            : `${st.name} check: you already own all ${r.lastPicks.length} it picks`,
          tone: 'gold',
          route: 'Lab',
        },
      ]);
    }, 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, follow?.id, mine, key]);
  return items;
}
