/** Saves journal entries on the phone. */
import { load, save } from '../storage';
import { addEntry, Entry } from './journal';

const KEY = 'journal.v1';
let list: Entry[] | null = null;
let chain: Promise<void> = Promise.resolve();

export async function entries(): Promise<Entry[]> {
  if (!list) list = tidy(await load<Entry[]>(KEY, []));
  return list;
}

/** Older entries made on a weekend move to Friday; the same call twice on one day is kept once. */
function tidy(all: Entry[]): Entry[] {
  let out: Entry[] = [];
  for (const e of all) out = addEntry(out, { ...e, day: pkToday(Date.parse(e.day + 'T12:00:00+05:00')) }, Infinity);
  return out;
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

/**
 * The trading day an entry belongs to (Pakistan time). Saturday and Sunday count
 * as Friday, so opening a stock over the weekend doesn't record the same call
 * three times at one price.
 */
export const pkToday = (now = Date.now()) => {
  const d = new Date(now + 5 * 3600_000);
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (wd === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
};

/** Forget the in-memory copy (after a restore wrote new entries). */
export function reloadJournal() {
  list = null;
}
