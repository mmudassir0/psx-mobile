/**
 * Keeps a "Sahm" calendar on the phone filled with your holdings' dates. Sahm owns
 * that calendar: each sync clears its upcoming events and writes them again, so
 * nothing in your other calendars is touched. Turning it off deletes the calendar.
 */
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { makePref } from '../prefs';
import { MPC_DATES } from '../analysis/events';
import { lastBuyDay as lastBuy } from '../analysis/dividends';
import { logProblem } from '../log';
import { calendarEvents, eventsSig, type CalEvent } from './calendarEvents';
import type { Row } from './useReviews';

export interface CalendarSync {
  on: boolean;
  calendarId: string | null;
  /** fingerprint of the events last written */
  sig: string;
  at: number;
}
export const calendarPref = makePref<CalendarSync>('ui.calendarSync', { on: false, calendarId: null, sig: '', at: 0 });

const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
export const supported = Platform.OS === 'android';

export async function askCalendar(): Promise<boolean> {
  if (!supported) return false;
  try {
    return (await Calendar.requestCalendarPermissionsAsync()).granted;
  } catch (e) {
    logProblem('calendar', e);
    return false;
  }
}

async function ownCalendar(id: string | null): Promise<string> {
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const found = all.find((c) => c.id === id) ?? all.find((c) => c.title === 'Sahm' && c.source?.isLocalAccount);
  if (found) return found.id;
  return Calendar.createCalendarAsync({
    title: 'Sahm',
    name: 'sahm',
    color: '#C9A24B',
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: 'Sahm', type: Calendar.SourceType.LOCAL },
    ownerAccount: 'Sahm',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

export function eventsFor(rows: Row[]): CalEvent[] {
  const now = Date.now();
  return calendarEvents(
    rows.map((r) => ({
      symbol: r.holding.symbol,
      payouts: (r.dividends?.list ?? [])
        .filter((p) => p.bookClosure != null && p.bookClosure > now - 864e5 && (p.dps > 0 || p.bonusPct > 0))
        .map((p) => ({ bookClosure: p.bookClosure!, lastBuyDay: lastBuy(p.bookClosure!), dps: p.dps, bonusPct: p.bonusPct })),
      results: r.next ? { expected: r.next.expected, meeting: r.next.meeting, label: r.next.label, basis: r.next.basis } : null,
    })),
    pkToday(),
    MPC_DATES,
  );
}

/** Writes the events; returns how many. */
export async function syncCalendar(rows: Row[], force = false): Promise<number> {
  const s = await calendarPref.get();
  if (!s.on || !supported) return 0;
  const events = eventsFor(rows);
  const sig = eventsSig(events);
  if (!force && sig === s.sig && s.calendarId) return events.length;
  try {
    const id = await ownCalendar(s.calendarId);
    const from = new Date(Date.now() - 2 * 864e5);
    const to = new Date(Date.now() + 400 * 864e5);
    for (const e of await Calendar.getEventsAsync([id], from, to)) await Calendar.deleteEventAsync(e.id).catch(() => {});
    for (const e of events) {
      // all-day events run midnight to midnight in the phone's own time zone
      const [y, m, d] = e.day.split('-').map(Number);
      await Calendar.createEventAsync(id, { title: e.title, notes: e.notes, allDay: true, startDate: new Date(y, m - 1, d), endDate: new Date(y, m - 1, d + 1), timeZone: 'Asia/Karachi', alarms: [] });
    }
    await calendarPref.set({ on: true, calendarId: id, sig, at: Date.now() });
    return events.length;
  } catch (e) {
    logProblem('calendar', e);
    throw e;
  }
}

export async function stopCalendar() {
  const s = await calendarPref.get();
  if (supported && s.calendarId) await Calendar.deleteCalendarAsync(s.calendarId).catch((e) => logProblem('calendar', e));
  await calendarPref.set({ on: false, calendarId: null, sig: '', at: 0 });
}

/** On Home: keeps the calendar up to date as new dates are announced. */
export function useCalendarSync(rows: Row[], ready: boolean) {
  const s = calendarPref.use();
  const sig = useMemo(() => (ready && s.on ? eventsSig(eventsFor(rows)) : ''), [ready, s.on, rows]);
  useEffect(() => {
    if (!ready || !s.on || sig === s.sig) return;
    syncCalendar(rows).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.on, sig]);
}
