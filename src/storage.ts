import AsyncStorage from '@react-native-async-storage/async-storage';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working from memory.
  }
}

/** Cached value with a timestamp, for slow-changing PSX data. */
export interface Cached<T> {
  at: number;
  data: T;
}

export async function loadCached<T>(key: string): Promise<Cached<T> | null> {
  return load<Cached<T> | null>(key, null);
}

export async function saveCached<T>(key: string, data: T): Promise<void> {
  await save(key, { at: Date.now(), data });
}
