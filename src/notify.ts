/**
 * Reminders that pop up on the phone at a set time, scheduled by Sahm itself
 * (no server): note review dates and the monthly investing day. Each has an id,
 * so scheduling again replaces it. Tapping one opens the screen in `url`.
 */
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logProblem } from './log';

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
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
}

/** A day (YYYY-MM-DD) at 10:00 Pakistan time. */
export const morningOf = (day: string) => new Date(Date.parse(`${day}T10:00:00+05:00`));
