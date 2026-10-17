/** Downloads the latest balance sheets (about 100 KB) twice a day, keeping a copy on the phone. */
import { cached } from './cache';
import { setLiveFundamentals } from '../analysis/ratios';
import { DATA_BASE } from '../picks/config';

export async function loadLiveFundamentals(): Promise<void> {
  try {
    const s = await cached(
      'fundamentals:live',
      12 * 3600_000,
      async () => {
        const res = await fetch(`${DATA_BASE}/fundamentals.json`);
        if (!res.ok) throw new Error(`fundamentals ${res.status}`);
        return res.json();
      },
      { persist: true },
    );
    setLiveFundamentals(s);
  } catch {
    // offline: the copy bundled with the app is used
  }
}
