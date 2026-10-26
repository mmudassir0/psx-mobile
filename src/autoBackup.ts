/**
 * Automatic weekly backup into a folder you choose once (a folder in
 * Download, for example). Android remembers the
 * permission, so later backups happen quietly when Sahm is opened. The last
 * four are kept. The folder outlives the app, so a reinstall or a new phone
 * can restore from it.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { exportBackup, readBackup, type Restore } from './backup';
import { makePref } from './prefs';
import { logProblem } from './log';
import { backupDay, folderName, KEEP, toPrune } from './backupFiles';

export { backupDay, folderName, toPrune };

const SAF = FileSystem.StorageAccessFramework;
export const EVERY_MS = 7 * 864e5;
const PREFIX = 'Sahm backup ';

export interface AutoBackup {
  /** the folder's SAF address, or null when off */
  dir: string | null;
  /** last successful backup, epoch ms */
  lastAt: number;
  /** why the last attempt failed, if it did */
  error?: string | null;
}

export const autoBackupPref = makePref<AutoBackup>('backup.auto', { dir: null, lastAt: 0 });

export const supported = Platform.OS === 'android';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** Asks Android for a folder. Returns its address, or null if you backed out. */
export async function chooseFolder(): Promise<string | null> {
  const r = await SAF.requestDirectoryPermissionsAsync();
  return r.granted ? r.directoryUri : null;
}

/** Writes one backup now into `dir` (replacing today's if there is one) and trims old ones. */
export async function backupNow(dir: string, now = Date.now()): Promise<void> {
  const json = await exportBackup();
  const day = pkDay(now);
  const existing = await SAF.readDirectoryAsync(dir);
  for (const u of existing.filter((u) => backupDay(u) === day)) await SAF.deleteAsync(u, { idempotent: true }).catch(() => {});
  const file = await SAF.createFileAsync(dir, `${PREFIX}${day}`, 'application/json');
  await SAF.writeAsStringAsync(file, json);
  for (const u of toPrune([...existing.filter((u) => backupDay(u) !== day), file])) await SAF.deleteAsync(u, { idempotent: true }).catch(() => {});
}

/** Turns weekly backups on with this folder and makes the first one straight away. */
export async function enable(dir: string) {
  await backupNow(dir);
  await autoBackupPref.set({ dir, lastAt: Date.now(), error: null });
}

export async function disable() {
  await autoBackupPref.set({ dir: null, lastAt: 0, error: null });
}

let running = false;
/** Called when Sahm opens: backs up if a week has passed. Never throws. */
export async function maybeBackup(now = Date.now()) {
  if (!supported || running) return;
  running = true;
  try {
    const cur = await autoBackupPref.get();
    if (!cur.dir || now - cur.lastAt < EVERY_MS) return;
    try {
      await backupNow(cur.dir, now);
      await autoBackupPref.set({ ...cur, lastAt: now, error: null });
    } catch (e) {
      // usually the folder was deleted or access was removed: shown in Settings
      logProblem('automatic backup', e);
      await autoBackupPref.set({ ...cur, error: (e as Error).message || 'Could not write to the folder' });
    }
  } finally {
    running = false;
  }
}

/** The backups in a folder, newest first, each read and checked. */
export async function listBackups(dir: string): Promise<{ uri: string; day: string; restore: Restore | null }[]> {
  const uris = (await SAF.readDirectoryAsync(dir)).filter((u) => backupDay(u));
  uris.sort((a, b) => (backupDay(b)! < backupDay(a)! ? -1 : 1));
  const out = [];
  for (const uri of uris.slice(0, 8)) {
    let restore: Restore | null = null;
    try {
      const r = readBackup(await SAF.readAsStringAsync(uri));
      if (r.ok) restore = r.restore;
    } catch {
      // unreadable: listed without a restore
    }
    out.push({ uri, day: backupDay(uri)!, restore });
  }
  return out;
}
