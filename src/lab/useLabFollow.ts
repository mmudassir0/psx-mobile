/** Home's reminder for a followed lab strategy: on check days, what it holds now and which you don't own. */
import { useEffect, useState } from 'react';
import { remind, cancelReminder, ensureReady, notifyNow } from '../notify';
import { makePref } from '../prefs';
import type { TodoItem } from '../portfolio/summary';
import { runBacktest } from './engine';
import { checkDue, followPlan, nextCheck, recentExits } from './follow';

const labAlertedPref = makePref<string[]>('ui.labAlerted', []);
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
      const r = runBacktest(lab, st);
      if (!alive) return;
      // early sales in the last week (stop or trend): a todo, and one notification each
      const exits = recentExits(lab, r.trades, 5, r.pending);
      const out: TodoItem[] = exits.map((x) => ({
        key: `lab-exit-${x.symbol}-${x.day}`,
        text: `${st.name}: ${x.symbol} ${x.why === 'stop' ? 'hit its stop' : 'dropped under its 200-day average'} on ${x.day}: the strategy sells it`,
        tone: 'down' as const,
        symbol: x.symbol,
      }));
      const seen = await labAlertedPref.get();
      const fresh = exits.filter((x) => !seen.includes(`${st.id}:${x.symbol}:${x.day}`));
      if (fresh.length) {
        await labAlertedPref.set([...seen, ...fresh.map((x) => `${st.id}:${x.symbol}:${x.day}`)].slice(-60));
        notifyNow(
          fresh.length === 1 ? `${st.name}: sell ${fresh[0].symbol}` : `${st.name}: ${fresh.length} sales`,
          fresh.map((x) => `${x.symbol} ${x.why === 'stop' ? 'hit its stop' : 'is under its 200-day average'} (${x.day})`).join('\n'),
          'sahm://lab',
        ).catch(() => {});
      }
      if (!checkDue(lab, st, today)) return setItems(out);
      const p = followPlan(r.lastPicks, owned);
      setItems([
        ...out,
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
