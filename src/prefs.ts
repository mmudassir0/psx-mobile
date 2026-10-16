/** A small value saved on the phone that several screens read and change (with live updates). */
import { useEffect, useState } from 'react';
import { load, save } from './storage';

export function makePref<T>(key: string, fallback: T) {
  let current: T | null = null;
  const listeners = new Set<(v: T) => void>();
  const get = async (): Promise<T> => {
    if (current == null) current = await load<T>(key, fallback);
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
  return { key, get, set, use };
}
