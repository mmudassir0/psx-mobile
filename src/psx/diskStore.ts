/** Saves cache entries as files in the app's private storage. */
import * as FileSystem from 'expo-file-system/legacy';
import type { KeyValueStore } from './cache';

const DIR = `${FileSystem.documentDirectory}psx-cache/`;
const PRUNE_AFTER_MS = 60 * 24 * 3600_000;
const path = (key: string) => `${DIR}${encodeURIComponent(key).replace(/%/g, '_')}.json`;

let ready: Promise<void> | null = null;
function ensureDir() {
  if (!ready) {
    ready = (async () => {
      const info = await FileSystem.getInfoAsync(DIR);
      if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
      // Reads and writes can start now; clean up in the background.
      setTimeout(() => prune().catch(() => {}), 5000);
    })().catch(() => {});
  }
  return ready;
}

/** Drops stocks not opened for two months so the cache can't grow forever. */
async function prune() {
  const names = await FileSystem.readDirectoryAsync(DIR);
  const cutoff = Date.now() / 1000 - PRUNE_AFTER_MS / 1000;
  for (const n of names) {
    const f = await FileSystem.getInfoAsync(DIR + n);
    if (f.exists && !f.isDirectory && (f.modificationTime ?? 0) < cutoff) await FileSystem.deleteAsync(DIR + n, { idempotent: true });
  }
}

export const diskStore: KeyValueStore = {
  async get(key) {
    await ensureDir();
    try {
      return await FileSystem.readAsStringAsync(path(key));
    } catch {
      return null;
    }
  },
  async set(key, value) {
    await ensureDir();
    await FileSystem.writeAsStringAsync(path(key), value);
  },
};
