/**
 * Reminders that pop up on the phone at a set time, scheduled by Sahm itself
 * (no server): note review dates and the monthly investing day. Each has an id,
 * so scheduling again replaces it. Tapping one opens the screen in `url`.
 */
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logProblem } from './log';
import { makePref } from './prefs';
import { load, save } from './storage';
import { QUIET_DEFAULT, heldText, hold, holdUntil, type HeldAlert, type QuietSettings } from './quietCore';
import { addToInbox } from './inbox';

export const quietPref = makePref<QuietSettings>('ui.quiet', QUIET_DEFAULT);
const HELD_KEY = 'ui.heldAlerts';
const HELD_ID = 'held-alerts';

const CHANNEL = 'reminders';
const supported = Platform.OS === 'android';
let ready: Promise<boolean> | null = null;

/** Sets up the channel and asks for permission once (Android 13 and later ask the user). */
export function ensureReady(ask = true): Promise<boolean> {
  if (!supported) return Promise.resolve(false);
  if (!ready)
    ready = (async () => {
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
        const cur = await Notifications.getPermissionsAsync();
        if (cur.granted) return true;
        if (!ask) return false;
        return (await Notifications.requestPermissionsAsync()).granted;
      } catch (e) {
        logProblem('reminders', e);
        return false;
      }
    })().then((ok) => {
      if (!ok) ready = null; // ask again next time
      return ok;
    });
  return ready;
}

/** Schedules (or replaces) reminder `id` for `when`. Past times are skipped. Never throws. */
export async function remind(id: string, when: Date, title: string, body: string, url?: string) {
  if (!supported || when.getTime() <= Date.now() + 60_000) return;
  if (!(await ensureReady())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, data: url ? { url } : {} },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
    });
  } catch (e) {
    logProblem('reminders', e);
  }
}

/**
 * Shows a notification straight away, or keeps it for later in the quiet hours
 * or for the evening summary (one notification for all of them). Never throws.
 */
export async function notifyNow(title: string, body: string, url?: string) {
  // kept in the in-app inbox whatever happens to the notification itself
  await addToInbox({ t: Date.now(), title, body, ...(url ? { url } : {}) }).catch(() => {});
  if (!supported) return;
  if (!(await ensureReady(false))) return;
  try {
    const now = Date.now();
    const at = holdUntil(now, await load<QuietSettings>('ui.quiet', QUIET_DEFAULT));
    if (at != null) {
      const q = hold(await load<HeldAlert[]>(HELD_KEY, []), { t: now, at, title, body, url }, now);
      await save(HELD_KEY, q);
      const text = heldText(q, at);
      if (!text) return;
      await Notifications.cancelScheduledNotificationAsync(HELD_ID + at).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: HELD_ID + at,
        content: { title: text.title, body: text.body, data: { url: text.url } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL },
      });
      return;
    }
    await Notifications.scheduleNotificationAsync({ content: { title, body, data: url ? { url } : {} }, trigger: { channelId: CHANNEL } as never });
  } catch (e) {
    logProblem('reminders', e);
  }
}

export async function cancelReminder(id: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** The ids of reminders waiting to fire. */
export async function scheduledIds(): Promise<string[]> {
  if (!supported) return [];
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier);
  } catch {
    return [];
  }
}

/** At startup: show reminders while the app is open, and open their screen when tapped. */
export function installReminderHandlers() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const open = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('sahm://')) Linking.openURL(url).catch(() => {});
  };
  Notifications.addNotificationResponseReceivedListener(open);
  // the app was closed and opened by tapping a reminder
  Notifications.getLastNotificationResponseAsync()
    .then(open)
    .catch(() => {});
}

/** A day (YYYY-MM-DD) at 10:00 Pakistan time. */
export const morningOf = (day: string) => new Date(Date.parse(`${day}T10:00:00+05:00`));
