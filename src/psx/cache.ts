/**
 * One cache for everything Sahm downloads from PSX, shared by every screen and
 * the AI chat.
 *
 * - Memory first, then the phone's storage (for entries marked `persist`),
 *   then the network.
 * - Two requests for the same thing at once share one download.
 * - If the network fails, the last saved copy is used rather than an error.
 *
 * Storage is plugged in at startup (`setStorage`), so this file runs anywhere,
 * including the Node tests.
 */
/** Company pages carry results and announcements: reuse for an hour (live prices come from the trading board). */
export const COMPANY_TTL = 60 * 60_000;

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

import { isMarketOpen, lastSessionEnd } from '../market-hours';

/** Downloads whose figures only change while PSX trades: prices, charts, index members, company pages. */
const PRICED = /^(eod|int|cons|company):/;
/**
 * A priced copy fetched after the last session ended, with the market still shut, can't be any newer:
 * keep using it until the next open however old the TTL says it is (evenings, weekends, holidays).
 */
export const settled = (key: string, at: number, now: number) => PRICED.test(key) && !isMarketOpen(now) && at >= lastSessionEnd(now);

let storage: KeyValueStore = memoryStore();
export function setStorage(s: KeyValueStore) {
  storage = s;
}

interface Entry<T> {
  at: number;
  data: T;
}
const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Forget everything held in memory (tests). */
export function clearMemory() {
  mem.clear();
  inflight.clear();
}

export async function readEntry<T>(key: string, persist: boolean): Promise<Entry<T> | null> {
  const m = mem.get(key) as Entry<T> | undefined;
  if (m) return m;
  if (!persist) return null;
  try {
    const raw = await storage.get(key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    mem.set(key, e);
    return e;
  } catch {
    return null;
  }
}

export async function writeEntry<T>(key: string, data: T, persist: boolean, at = Date.now()) {
  const e = { at, data };
  mem.set(key, e);
  if (persist) await storage.set(key, JSON.stringify(e)).catch(() => {});
}

export interface CacheOptions {
  /** skip the cache and download (pull to refresh) */
  force?: boolean;
  /** keep a copy on the phone so it survives restarts */
  persist?: boolean;
  now?: () => number;
}

/** Shares one download between callers that ask for the same key at the same time. */
export function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function cached<T>(key: string, ttl: number, load: () => Promise<T>, opts: CacheOptions = {}): Promise<T> {
  const now = opts.now ?? Date.now;
  const persist = !!opts.persist;
  const hit = await readEntry<T>(key, persist);
  if (!opts.force && hit && (now() - hit.at < ttl || settled(key, hit.at, now()))) return hit.data;
  return once(key, async () => {
    try {
      const data = await load();
      await writeEntry(key, data, persist, now());
      return data;
    } catch (e) {
      if (hit) return hit.data; // offline or PSX busy: the last copy beats an error
      throw e;
    }
  });
}
