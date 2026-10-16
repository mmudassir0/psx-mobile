/** Reads the latest picks feed from Sahm's ntfy channel, keeping the last copy on the phone. */
import { useCallback, useEffect, useState } from 'react';
import { cached } from '../psx/cache';
import { ListId, listOf, PicksFeed } from './build';
import type { MarketFeed } from '../analysis/market';
import { FEED_TOPIC, NTFY } from './config';

export type Feeds = Partial<Record<ListId, PicksFeed>> & { market?: MarketFeed };

/** The newest feed for each list in an ntfy JSON stream (one JSON object per line). */
export function parseFeeds(ndjson: string): Feeds {
  const out: Feeds = {};
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.event !== 'message' || typeof m.message !== 'string') continue;
      const raw = JSON.parse(m.message);
      if (raw?.v === 1 && raw.kind === 'market' && Array.isArray(raw.sectors)) {
        if (!out.market || raw.generatedAt > out.market.generatedAt) out.market = raw as MarketFeed;
        continue;
      }
      const f = raw as PicksFeed;
      if (f?.v !== 1 || !Array.isArray(f.picks)) continue;
      const id = listOf(f);
      if (!out[id] || f.generatedAt > out[id]!.generatedAt) out[id] = f;
    } catch {
      // not a feed message
    }
  }
  return out;
}

/** The newest feed of any list (tests, older callers). */
export const parseFeed = (ndjson: string): PicksFeed | null => {
  const { market: _m, ...lists } = parseFeeds(ndjson);
  return (Object.values(lists) as PicksFeed[]).sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1))[0] ?? null;
};

export async function fetchFeeds(): Promise<Feeds> {
  const res = await fetch(`${NTFY}/${FEED_TOPIC}/json?poll=1&since=all`);
  if (!res.ok) throw new Error(`Picks channel answered ${res.status}`);
  const f = parseFeeds(await res.text());
  // ntfy keeps messages about 12 hours; without one, the saved copy is used.
  if (!f.all) throw new Error('No new picks published yet');
  return f;
}

export function usePicksFeed() {
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setFeeds(await cached('picks:feeds', 10 * 60_000, fetchFeeds, { persist: true, force }));
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
  return { feeds, feed: feeds?.all ?? null, market: feeds?.market ?? null, error, loading, reload: () => load(true) };
}
