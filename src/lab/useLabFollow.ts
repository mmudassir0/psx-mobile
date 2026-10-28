/** Home's reminder for a followed lab strategy: on check days, what it holds now and which you don't own. */
import { useEffect, useState } from 'react';
import { runCached } from './cache';
import { remind, cancelReminder, ensureReady, notifyNow } from '../notify';
import { makePref } from '../prefs';
import { snapshots, trackReturns } from '../portfolio/track';
import type { TodoItem } from '../portfolio/summary';
import { checkDue, followPlan, nextCheck, recentExits } from './follow';

const labAlertedPref = makePref<string[]>('ui.labAlerted', []);
/** the last month a monthly review was sent for */
const labMonthlyPref = makePref<string>('ui.labMonthly', '');

/** growth over a month (YYYY-MM) of a series starting at `start` in the lab's days; null if the month isn't covered */
function monthGrowth(days: string[], start: number, g: Float64Array, ym: string): number | null {
  let a = -1,
    b = -1;
  for (let i = start; i < days.length; i++) {
    if (days[i] < ym) a = i;
    else if (days[i].startsWith(ym)) b = i;
  }
  if (a < start || b < 0) return null;
  return g[b - start] / g[a - start] - 1;
}
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
      {
        const y = Number(today.slice(0, 4)),
          m = Number(today.slice(5, 7));
        const first = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
        if (await ensureReady(false))
          remind('lab-month', new Date(Date.parse(`${first}T09:15:00+05:00`)), `Monthly review: ${st.name}`, 'Last month for your lab strategy, the index and your portfolio. Open Sahm to see it.', 'sahm://home');
      }
      const r = runCached(lab, st);
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
      // the monthly review: last month for the strategy, the index and your portfolio, once at the start of a month
      const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15)).toISOString().slice(0, 7);
      const lastDay = lab.days[lab.days.length - 1];
      if (lastDay.slice(0, 7) > lastMonth && Number(today.slice(8, 10)) <= 7) {
        const sg = monthGrowth(lab.days, r.start, r.growth, lastMonth);
        const bg = monthGrowth(lab.days, r.start, r.benchGrowth, lastMonth);
        if (sg != null && bg != null) {
          const snaps = trackReturns((await snapshots()).filter((x) => x.value > 0));
          const a = [...snaps].reverse().find((p) => p.day < lastMonth);
          const b = [...snaps].reverse().find((p) => p.day.startsWith(lastMonth));
          const mineG = a && b ? (1 + b.ret) / (1 + a.ret) - 1 : null;
          const p1 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
          const month = new Date(`${lastMonth}-15T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
          const body = `${st.name} ${p1(sg)}, index ${p1(bg)}${mineG != null ? `, your portfolio ${p1(mineG)}` : ''}.`;
          out.push({ key: `lab-month-${lastMonth}`, text: `${month} in review: ${body}`, tone: sg >= bg ? 'up' : 'plain', route: 'Lab' });
          if ((await labMonthlyPref.get()) !== lastMonth) {
            await labMonthlyPref.set(lastMonth);
            notifyNow(`${month}: your lab strategy`, body, 'sahm://lab').catch(() => {});
          }
        }
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
