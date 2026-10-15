/** Web preview: browser storage, falling back to memory when it is unavailable or full. */
import { KeyValueStore, memoryStore } from './cache';

const fallback = memoryStore();
export const diskStore: KeyValueStore = {
  async get(key) {
    try {
      return localStorage.getItem('psx:' + key) ?? (await fallback.get(key));
    } catch {
      return fallback.get(key);
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem('psx:' + key, value);
    } catch {
      await fallback.set(key, value);
    }
  },
};
