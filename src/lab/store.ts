/**
 * The lab's data on the phone: downloaded from the daily job's feed once, kept
 * as a file (it's too big for settings storage), and updated when a newer one is
 * published. Saved strategies are a setting, included in backups.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { makePref } from '../prefs';
import { FEED_BASE } from '../picks/config';
import { getJson } from '../net';
import { logProblem } from '../log';
import { decodeLab, isLabFile, type Lab, type LabFile } from './data';
import type { Strategy } from './engine';
import { BASE, TEMPLATES } from './templates';

export const labStrategiesPref = makePref<Strategy[]>('user.labStrategies', []);
/** backtests built from questions in the AI chat, newest first */
export interface Asked {
  q: string;
  at: string;
  strategy: Strategy;
}
export const labAskedPref = makePref<Asked[]>('user.labAsked', []);
/** the strategy you follow, if any */
export const labFollowPref = makePref<{ id: string; since: string } | null>('user.labFollow', null);

/** The strategy being edited, before it's saved (shown as LabResult 'draft'). */
let draft: Strategy | null = null;
export const setDraft = (s: Strategy | null) => (draft = s);
export const getDraft = () => draft;

/** A saved strategy, a template, or the draft. */
/** Strategies from the last hunt, so their results can be opened. */
const hunted = new Map<string, Strategy>();
export const rememberHunted = (list: Strategy[]) => list.forEach((s) => hunted.set(s.id, s));

/** Your current holdings as a strategy: bought in equal amounts at the start and evened out yearly. */
export function holdingsStrategy(symbols: string[]): Strategy | null {
  if (!symbols.length) return null;
  const s: Strategy = { ...BASE, id: 'my-holdings', name: 'Your holdings', only: [...symbols].sort(), universe: 'all', minValue: 0, rank: 'value', desc: true, hold: symbols.length, every: 12, perSector: 0, filters: [] };
  hunted.set(s.id, s);
  return s;
}

export function findStrategy(id: string, mine: Strategy[]): Strategy | null {
  if (id === 'draft') return draft;
  if (hunted.has(id)) return hunted.get(id)!;
  return mine.find((s) => s.id === id) ?? TEMPLATES.find((t) => t.strategy.id === id)?.strategy ?? null;
}

const FILE = Platform.OS === 'web' ? null : `${FileSystem.documentDirectory}lab.json`;
let lab: Lab | null = null;
let loading: Promise<Lab | null> | null = null;
const listeners = new Set<(s: LabState) => void>();

export interface LabState {
  lab: Lab | null;
  busy: boolean;
  error: string | null;
  /** when the saved copy was built */
  built: string | null;
}
let state: LabState = { lab: null, busy: false, error: null, built: null };
const set = (p: Partial<LabState>) => {
  state = { ...state, ...p };
  listeners.forEach((f) => f(state));
};

async function readSaved(): Promise<LabFile | null> {
  if (!FILE) return null;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return null;
    const j = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return isLabFile(j) ? j : null;
  } catch (e) {
    logProblem('lab file', e);
    return null;
  }
}

/** The lab if it's on the phone already (never downloads). */
export async function peekLab(): Promise<Lab | null> {
  if (lab) return lab;
  const saved = await readSaved();
  if (saved && !lab) {
    lab = decodeLab(saved);
    set({ lab, built: saved.built });
  }
  return lab;
}

/** Loads the saved copy, then downloads a newer one if it's more than a day old (or `force`). */
export function loadLab(force = false): Promise<Lab | null> {
  if (loading) return loading;
  loading = (async () => {
    set({ busy: true, error: null });
    try {
      if (!lab) {
        const saved = await readSaved();
        if (saved) {
          lab = decodeLab(saved);
          set({ lab, built: saved.built });
        }
      }
      const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
      if (force || !lab || lab.built < today) {
        try {
          const j = await getJson(`${FEED_BASE}/lab.json?t=${today}`, 90_000);
          if (isLabFile(j) && (!lab || j.built >= lab.built)) {
            if (FILE) await FileSystem.writeAsStringAsync(FILE, JSON.stringify(j)).catch((e) => logProblem('lab file', e));
            lab = decodeLab(j);
            set({ lab, built: j.built });
          }
        } catch (e) {
          if (!lab) set({ error: (e as Error).message === 'Not published yet' ? 'The lab’s data comes with tonight’s daily update. Try again tomorrow.' : (e as Error).message });
        }
      }
      return lab;
    } finally {
      set({ busy: false });
      loading = null;
    }
  })();
  return loading;
}

export function useLab(): LabState & { reload: () => void } {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (!lab && !loading) loadLab().catch(() => {});
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return { ...s, reload: () => loadLab(true).catch(() => {}) };
}
