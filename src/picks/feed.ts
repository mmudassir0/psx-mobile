/** Reads the latest picks feed from Sahm's ntfy channel, keeping the last copy on the phone. */
import { useCallback, useEffect, useState } from 'react';
import { cached } from '../psx/cache';
import type { PicksFeed } from './build';
import { FEED_TOPIC, NTFY } from './config';

/** The newest feed in an ntfy JSON stream (one JSON object per line). */
export function parseFeed(ndjson: string): PicksFeed | null {
  let latest: PicksFeed | null = null;
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.event !== 'message' || typeof m.message !== 'string') continue;
      const f = JSON.parse(m.message) as PicksFeed;
      if (f?.v === 1 && Array.isArray(f.picks) && (!latest || f.generatedAt > latest.generatedAt)) latest = f;
    } catch {
      // not a feed message
    }
  }
  return latest;
}

export async function fetchFeed(): Promise<PicksFeed> {
  const res = await fetch(`${NTFY}/${FEED_TOPIC}/json?poll=1&since=all`);
  if (!res.ok) throw new Error(`Picks channel answered ${res.status}`);
  const f = parseFeed(await res.text());
  // ntfy keeps messages about 12 hours; without one, the saved copy is used.
  if (!f) throw new Error('No new picks published yet');
  return f;
}

export function usePicksFeed() {
  const [feed, setFeed] = useState<PicksFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setFeed(await cached('picks:feed', 10 * 60_000, fetchFeed, { persist: true, force }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { feed, error, loading, reload: () => load(true) };
}
