/**
 * Startup: how long Sahm took to show prices (saved for Settings → App), and a
 * "settled" signal a few seconds after the first screen, so background chores
 * (reminders, calendar, bonus shares, line alerts) don't compete with it.
 */
import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { makePref } from './prefs';

const started = Date.now();
export const startPref = makePref<{ ms: number; at: number } | null>('ui.lastStart', null);
let recorded = false;

/** Call once the first screen shows real prices. */
export function markReady() {
  if (recorded) return;
  recorded = true;
  startPref.set({ ms: Date.now() - started, at: Date.now() });
}

/** True a few seconds after the screen first settles. */
export function useSettled(delayMs = 3000): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      id = setTimeout(() => setOk(true), delayMs);
    });
    return () => {
      task.cancel();
      if (id) clearTimeout(id);
    };
  }, [delayMs]);
  return ok;
}
