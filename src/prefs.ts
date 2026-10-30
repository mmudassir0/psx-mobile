/** A small value saved on the phone that several screens read and change (with live updates). */
import { useEffect, useState } from 'react';
import { load, save } from './storage';

const registry: { reload: () => Promise<void> }[] = [];

/** Re-reads every setting from the phone (after a backup is restored), so nothing stale is saved over it. */
export async function reloadAllPrefs() {
  await Promise.all(registry.map((p) => p.reload()));
}

export function makePref<T>(key: string, fallback: T) {
  let current: T | null = null;
  const listeners = new Set<(v: T) => void>();
  const get = async (): Promise<T> => {
    if (current == null) {
      const saved = await load<T>(key, fallback);
      // a set() while the read was under way wins over what was on the phone before it
      if (current == null) current = saved;
    }
    return current;
  };
  const set = async (v: T) => {
    current = v;
    listeners.forEach((f) => f(v));
    await save(key, v);
  };
  const use = (): T => {
    const [v, setV] = useState<T>(current ?? fallback);
    useEffect(() => {
      let alive = true;
      get().then((x) => alive && setV(x));
      listeners.add(setV);
      return () => {
        alive = false;
        listeners.delete(setV);
      };
    }, []);
    return v;
  };
  const reload = async () => {
    current = await load<T>(key, fallback);
    const v = current;
    listeners.forEach((f) => f(v));
  };
  registry.push({ reload });
  return { key, get, set, use, reload };
}
