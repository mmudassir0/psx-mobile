/**
 * Backup to Google Drive (or anywhere the share sheet offers): the backup is
 * written to a file and handed to Android's share sheet, where "Save to Drive"
 * keeps it in your Google account. Restoring picks that file back from Drive.
 * An optional reminder each Sunday evening.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { exportBackup, readBackup, type Restore } from './backup';
import { makePref } from './prefs';
import { cancelReminder, remind } from './notify';

export const driveReminderPref = makePref<boolean>('backup.driveReminder', false);
export const driveSavedPref = makePref<number>('backup.driveSavedAt', 0);
const REMINDER_ID = 'drive-backup';

export const backupFileName = (now = Date.now()) => `sahm-backup-${new Date(now + 5 * 3600_000).toISOString().slice(0, 10)}.json`;

export async function shareBackupFile(): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Saving a file works in the app on your phone');
  const json = await exportBackup();
  const uri = `${FileSystem.cacheDirectory}${backupFileName()}`;
  await FileSystem.writeAsStringAsync(uri, json);
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save the Sahm backup (choose Drive)' });
  await driveSavedPref.set(Date.now());
}

/** Picks a backup file (from Drive, Downloads…) and checks it. */
export async function pickBackupFile(): Promise<{ ok: true; restore: Restore } | { ok: false; error: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const text = await FileSystem.readAsStringAsync(r.assets[0].uri);
  return readBackup(text);
}

/** The next Sunday at 20:00 Pakistan time. */
export function nextSundayEvening(now = Date.now()): Date {
  const pk = new Date(now + 5 * 3600_000);
  const days = (7 - pk.getUTCDay()) % 7;
  let t = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate() + days, 20) - 5 * 3600_000;
  if (t <= now + 60_000) t += 7 * 864e5;
  return new Date(t);
}

export async function scheduleDriveReminder(on: boolean) {
  if (!on) return cancelReminder(REMINDER_ID);
  await remind(REMINDER_ID, nextSundayEvening(), 'Save your Sahm backup to Drive', 'Tap, then Your data → Save to Google Drive. Keeps your holdings safe if the phone is lost.', 'sahm://settings');
}
