/** Saves journal entries on the phone. */
import { load, save } from '../storage';
import { addEntry, Entry } from './journal';

const KEY = 'journal.v1';
let list: Entry[] | null = null;
let chain: Promise<void> = Promise.resolve();

export async function entries(): Promise<Entry[]> {
  if (!list) list = await load<Entry[]>(KEY, []);
  return list;
}

/** Records an entry (once per stock, kind and day). Writes are queued so none are lost. */
export function record(e: Entry) {
  chain = chain.then(async () => {
    const cur = await entries();
    const next = addEntry(cur, e);
    if (next !== cur) {
      list = next;
      await save(KEY, next);
    }
  });
  return chain;
}

export const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Forget the in-memory copy (after a restore wrote new entries). */
export function reloadJournal() {
  list = null;
}
