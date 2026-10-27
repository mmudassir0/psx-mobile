/**
 * Keeps the morning notifications scheduled for the next three trading days,
 * rewritten each time Sahm has fresh figures (the phone sends them even when
 * Sahm is closed). Off until switched on in Settings.
 */
import { useEffect } from 'react';
import { makePref } from '../prefs';
import { cancelReminder, ensureReady, morningOf, remind, scheduledIds } from '../notify';
import { MPC_DATES } from '../analysis/events';
import { working } from '../analysis/dividends';
import { upcomingPayout } from '../analysis/dividends';
import { priceLine } from '../analysis/watch';
import { morningLines, morningText, nextTradingDays } from './morningBrief';
import { notesPref } from './notes';
import { targetsPref } from './targets';
import { watchRulesPref } from './prefs';
import type { Row } from './useReviews';

export interface MorningSettings {
  on: boolean;
  /** HH:MM, Pakistan time */
  time: string;
}
export const morningPref = makePref<MorningSettings>('ui.morningBrief', { on: false, time: '08:45' });
export const MORNING_TIMES = ['08:00', '08:30', '08:45', '09:00'];

const PREFIX = 'morning-';
const pkNow = () => new Date(Date.now() + 5 * 3600_000).toISOString();
const isTrading = (day: string) => working(Date.parse(`${day}T12:00:00+05:00`));

export async function scheduleMorning(rows: Row[], s: MorningSettings): Promise<number> {
  const old = (await scheduledIds()).filter((id) => id.startsWith(PREFIX));
  if (!s.on) {
    await Promise.all(old.map(cancelReminder));
    return 0;
  }
  const now = pkNow();
  const today = now.slice(0, 10);
  const start = now.slice(11, 16) < s.time ? today : new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const days = nextTradingDays(start, 3, isTrading);
  const [notes, targets, rules] = await Promise.all([notesPref.get(), targetsPref.get(), watchRulesPref.get()]);
  const held = new Set(rows.map((r) => r.holding.symbol));
  const closeOf = new Map(rows.map((r) => [r.holding.symbol, r.price]));
  const lines: { symbol: string; level: number; close: number; dir: '<' | '>' }[] = [];
  for (const r of rules) {
    const lv = priceLine(r);
    const c = closeOf.get(r.symbol);
    if (lv != null && c) lines.push({ symbol: r.symbol, level: lv, close: c, dir: r.dir === '<' ? '<' : '>' });
  }
  for (const [sym, t] of Object.entries(targets)) {
    const c = closeOf.get(sym);
    if (!c || !held.has(sym)) continue;
    if (t.target != null) lines.push({ symbol: sym, level: t.target, close: c, dir: '>' });
    if (t.rethink != null) lines.push({ symbol: sym, level: t.rethink, close: c, dir: '<' });
  }
  const keep = new Set<string>();
  days.forEach((day, i) => {
    const text = morningText(
      morningLines({
        day,
        holdings: rows.map((r) => {
          const p = upcomingPayout(r.dividends, Date.parse(`${day}T00:00:00+05:00`));
          return {
            symbol: r.holding.symbol,
            payout: p ? { bookClosure: p.bookClosure, lastBuyDay: p.lastBuyDay, dps: p.dps, bonusPct: p.bonusPct } : null,
            results: r.next ? { expected: r.next.expected, meeting: r.next.meeting, label: r.next.label } : null,
          };
        }),
        notesDue: Object.entries(notes)
          .filter(([, n]) => n.checkOn === day)
          .map(([sym]) => sym),
        // price lines are from the last close, so only for the next morning
        lines: i === 0 ? lines : [],
        events: MPC_DATES.includes(day) ? ['State Bank rate decision today'] : [],
      }),
    );
    if (!text) return;
    const id = PREFIX + day;
    keep.add(id);
    remind(id, new Date(Date.parse(`${day}T${s.time}:00+05:00`)), text.title, text.body, 'sahm://home');
  });
  await Promise.all(old.filter((id) => !keep.has(id)).map(cancelReminder));
  return keep.size;
}

/** On 1 July: the tax year just finished is ready to look back on. */
export async function scheduleYearReview(now = Date.now()) {
  // only when notifications are already allowed: never asks by itself
  if (!(await ensureReady(false))) return;
  const d = new Date(now + 5 * 3600_000);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  remind('year-review', morningOf(`${y}-07-01`), `Your tax year ${y - 1}–${String(y).slice(2)} in review`, 'Your return against the index, best and worst holdings, dividends and tax, on one page.', 'sahm://year-review');
}

/** Call where the holdings' reviews are loaded (Home). */
export function useMorningBrief(rows: Row[], ready: boolean) {
  const s = morningPref.use();
  const sig = rows.map((r) => `${r.holding.symbol}:${r.price.toFixed(1)}:${r.dividends?.list.length ?? 0}:${r.next?.expected ?? ''}`).join('|');
  useEffect(() => {
    if (!ready) return;
    scheduleMorning(rows, s).catch(() => {});
    scheduleYearReview().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig, s.on, s.time]);
}
