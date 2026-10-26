/** Reads the latest picks feed from the repo's picks branch, keeping the last copy on the phone. */
import { useCallback, useEffect, useState } from 'react';
import { cached } from '../psx/cache';
import { ListId, listOf, PicksFeed } from './build';
import type { MarketFeed } from '../analysis/market';
import { FEED_BASE } from './config';
import { getJson } from '../net';

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

/** Checks the shape of the files written by the daily job (latest.json: one feed per list; market.json). */
export function readFeedFiles(latest: unknown, market: unknown): Feeds {
  const out: Feeds = {};
  if (latest && typeof latest === 'object') {
    for (const [id, f] of Object.entries(latest as Record<string, PicksFeed>)) {
      if (f?.v !== 1 || !Array.isArray(f.picks) || typeof f.day !== 'string') continue;
      if (id === 'all' || id === 'kse100' || id === 'kmi30') out[id] = f;
    }
  }
  const m = market as MarketFeed | null;
  if (m?.v === 1 && m.kind === 'market' && Array.isArray(m.sectors)) out.market = m;
  return out;
}

export async function fetchFeeds(): Promise<Feeds> {
  const get = async (name: string) => {
    // a query string skips stale CDN copies after each run
    return getJson(`${FEED_BASE}/${name}?t=${Math.floor(Date.now() / 600_000)}`);
  };
  const [latest, market] = await Promise.all([get('latest.json'), get('market.json').catch(() => null)]);
  const f = readFeedFiles(latest, market);
  if (!f.all) throw new Error('No picks published yet');
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

/**
 * Another file the daily job writes (mood.json, calendar.json), cached for an
 * hour and kept on the phone so it still shows offline. `check` rejects
 * anything that isn't the expected shape.
 */
export function useFeedFile<T>(name: string, check: (raw: unknown) => raw is T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const raw = await cached(
          `feed:${name}`,
          60 * 60_000,
          async () => {
            const j = await getJson(`${FEED_BASE}/${name}?t=${Math.floor(Date.now() / 600_000)}`);
            if (!check(j)) throw new Error('Unexpected feed file');
            return j;
          },
          { persist: true, force },
        );
        setData(raw);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: () => load(true) };
}
