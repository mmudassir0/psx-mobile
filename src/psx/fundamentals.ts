/** Downloads the latest balance sheets (about 100 KB) twice a day, keeping a copy on the phone. */
import { cached } from './cache';
import { setLiveFundamentals } from '../analysis/ratios';
import { DATA_BASE } from '../picks/config';
import { getJson } from '../net';

export async function loadLiveFundamentals(): Promise<void> {
  try {
    const s = await cached(
      'fundamentals:live',
      12 * 3600_000,
      async () => {
        return getJson(`${DATA_BASE}/fundamentals.json`, 40_000);
      },
      { persist: true },
    );
    setLiveFundamentals(s as Parameters<typeof setLiveFundamentals>[0]);
  } catch {
    // offline: the copy bundled with the app is used
  }
}
