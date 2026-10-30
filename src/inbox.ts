/**
 * Every notification Sahm sends, kept in the app too (swiping one away on the phone doesn't lose it).
 * On the phone only, the latest 100. Works in the background task as well as in the app.
 */
import { useEffect, useState } from 'react';
import { load, save } from './storage';
import { makePref } from './prefs';

export interface InboxEntry {
  t: number;
  title: string;
  body: string;
  url?: string;
}

const KEY = 'ui.inbox';
/** when the inbox was last opened: anything newer counts as unread */
export const inboxSeenPref = makePref<number>('ui.inboxSeen', 0);
const listeners = new Set<(l: InboxEntry[]) => void>();
let chain: Promise<unknown> = Promise.resolve();

export const inboxEntries = () => load<InboxEntry[]>(KEY, []);

export function addToInbox(e: InboxEntry): Promise<unknown> {
  chain = chain.then(async () => {
    const next = [e, ...(await inboxEntries())].slice(0, 100);
    await save(KEY, next);
    listeners.forEach((f) => f(next));
  });
  return chain;
}

export async function clearInbox() {
  await save(KEY, []);
  listeners.forEach((f) => f([]));
}

export function useInbox(): { list: InboxEntry[]; unread: number } {
  const [list, setList] = useState<InboxEntry[]>([]);
  const seen = inboxSeenPref.use();
  useEffect(() => {
    let alive = true;
    inboxEntries().then((l) => alive && setList(l));
    listeners.add(setList);
    return () => {
      alive = false;
      listeners.delete(setList);
    };
  }, []);
  return { list, unread: list.filter((x) => x.t > seen).length };
}
