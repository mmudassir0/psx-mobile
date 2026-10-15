/**
 * App-wide state of the on-phone AI: which model is chosen, whether it is
 * downloaded, download progress (pause and resume survive app restarts), and
 * whether it is loaded into memory. Screens call `run()` to generate text.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Engine from '../ai/engine';
import { ChatMessage, Generation, LocalModel, MODELS, modelById } from '../ai/models';
import { CLOUD_LABEL, cloudGenerate, CloudError } from '../ai/cloud';
import type { Tier } from '../ai/context';
import { load as loadKey, save } from '../storage';

export type AiMode = 'auto' | 'online' | 'phone';

export interface Run {
  gen: Generation;
  /** which model is writing, e.g. "GPT-OSS 120B (online)" */
  engine: () => string;
}

export type Phase = 'checking' | 'none' | 'downloading' | 'paused' | 'installed' | 'loading' | 'ready' | 'error';

interface AiState {
  phase: Phase;
  model: LocalModel | null;
  progress: number;
  error: string | null;
  installed: Record<string, boolean>;
  simulated: boolean;
  startDownload: (id: string) => Promise<void>;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  select: (id: string) => Promise<void>;
  run: (build: (tier: Tier) => ChatMessage[], onText: (t: string) => void, maxTokens?: number) => Promise<Run>;
  mode: AiMode;
  setMode: (m: AiMode) => void;
  hasKey: boolean;
  setKey: (k: string | null) => Promise<void>;
  /** true when at least one engine can answer */
  available: boolean;
}

const Ctx = createContext<AiState | null>(null);
const K_MODEL = 'ai.model';
const K_RESUME = 'ai.resume';
const K_MODE = 'ai.mode';
const K_KEY = 'groq_api_key';

async function readKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(K_KEY);
  } catch {
    return null; // web preview
  }
}

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [modelId, setModelId] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dl = useRef<Engine.Download | null>(null);
  const [mode, setModeState] = useState<AiMode>('auto');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    loadKey<AiMode>(K_MODE, 'auto').then(setModeState);
    readKey().then((k) => setHasKey(!!k));
  }, []);

  const setMode = useCallback((m: AiMode) => {
    setModeState(m);
    save(K_MODE, m);
  }, []);

  const setKey = useCallback(async (k: string | null) => {
    try {
      if (k) await SecureStore.setItemAsync(K_KEY, k.trim());
      else await SecureStore.deleteItemAsync(K_KEY);
    } catch {
      // web preview has no secure store
    }
    setHasKey(!!k);
  }, []);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(MODELS.map(async (m) => [m.id, await Engine.isDownloaded(m)] as const));
    const map = Object.fromEntries(entries);
    setInstalled(map);
    return map as Record<string, boolean>;
  }, []);

  useEffect(() => {
    (async () => {
      const [saved, resume, map] = await Promise.all([
        loadKey<string | null>(K_MODEL, null),
        loadKey<{ id: string; data: string; progress: number } | null>(K_RESUME, null),
        refresh(),
      ]);
      const id = saved && map[saved] ? saved : MODELS.find((m) => map[m.id])?.id ?? saved;
      setModelId(id ?? null);
      if (resume && !map[resume.id]) {
        setModelId(resume.id);
        setProgress(resume.progress);
        setPhase('paused');
      } else setPhase(id && map[id] ? 'installed' : 'none');
    })();
  }, [refresh]);

  const startDownload = useCallback(
    async (id: string) => {
      const m = modelById(id);
      if (!m) return;
      setError(null);
      const free = await Engine.freeBytes();
      if (free != null && free < m.bytes + 300e6) {
        setError(`Not enough storage: needs ${(m.bytes / 1e9).toFixed(1)} GB, ${(free / 1e9).toFixed(1)} GB free.`);
        setPhase('error');
        return;
      }
      const resume = await loadKey<{ id: string; data: string; progress: number } | null>(K_RESUME, null);
      setModelId(id);
      save(K_MODEL, id);
      setPhase('downloading');
      const d = Engine.download(m, setProgress, resume?.id === id ? resume.data : null);
      dl.current = d;
      try {
        await d.done;
        if (dl.current !== d) return; // paused or cancelled
        dl.current = null;
        await save(K_RESUME, null);
        await refresh();
        setPhase((await Engine.isDownloaded(m)) ? 'installed' : 'paused');
      } catch (e) {
        if (dl.current !== d) return;
        dl.current = null;
        setError((e as Error).message);
        setPhase('error');
      }
    },
    [refresh],
  );

  const pause = useCallback(async () => {
    const d = dl.current;
    if (!d || !modelId) return;
    dl.current = null;
    const data = await d.pause();
    if (data) await save(K_RESUME, { id: modelId, data, progress });
    setPhase('paused');
  }, [modelId, progress]);

  const cancel = useCallback(async () => {
    const d = dl.current;
    dl.current = null;
    if (d) await d.cancel();
    await save(K_RESUME, null);
    const map = await refresh();
    setProgress(0);
    setPhase(modelId && map[modelId] ? 'installed' : 'none');
  }, [modelId, refresh]);

  const remove = useCallback(
    async (id: string) => {
      const m = modelById(id);
      if (!m) return;
      await Engine.remove(m);
      const map = await refresh();
      if (id === modelId) {
        const other = MODELS.find((x) => map[x.id]);
        setModelId(other?.id ?? null);
        save(K_MODEL, other?.id ?? null);
        setPhase(other ? 'installed' : 'none');
      }
    },
    [modelId, refresh],
  );

  const select = useCallback(
    async (id: string) => {
      setModelId(id);
      save(K_MODEL, id);
      await Engine.unload();
      setPhase(installed[id] ? 'installed' : 'none');
    },
    [installed],
  );

  const phoneReady = !!(modelId && installed[modelId]);

  const runPhone = useCallback(
    async (messages: ChatMessage[], onText: (t: string) => void, maxTokens?: number): Promise<Run> => {
      const m = modelById(modelId);
      if (!m || !installed[m.id]) throw new Error('Download an AI model first, or add a free Groq key in Settings → AI');
      if (phase !== 'ready') {
        setPhase('loading');
        setProgress(0);
        try {
          await Engine.load(m, setProgress);
        } catch (e) {
          setError(`Couldn't load the model: ${(e as Error).message}`);
          setPhase('error');
          throw e;
        }
        setPhase('ready');
      }
      return { gen: Engine.generate(messages, onText, maxTokens), engine: () => `${m.name} (on phone)` };
    },
    [modelId, installed, phase],
  );

  const run = useCallback(
    async (build: (tier: Tier) => ChatMessage[], onText: (t: string) => void, maxTokens?: number): Promise<Run> => {
      const key = mode !== 'phone' ? await readKey() : null;
      if (!key) {
        if (mode === 'online') throw new Error('Add your free Groq key in Settings → AI to use online AI');
        return runPhone(build('small'), onText, maxTokens);
      }
      // Online first. If it fails before writing anything (offline, limits), fall back to the phone model.
      let label = 'online';
      let wrote = false;
      const cloud = cloudGenerate(
        key,
        build('large'),
        (t) => {
          wrote = true;
          onText(t);
        },
        Math.max(maxTokens ?? 700, 700),
        (m) => (label = CLOUD_LABEL[m] ?? m),
      );
      let fallback: Run | null = null;
      const done = cloud.done.catch(async (e) => {
        const offline = e instanceof CloudError && (e.status === 0 || e.status === 429 || e.status >= 500);
        if (wrote || mode === 'online' || !offline || !phoneReady) throw e;
        fallback = await runPhone(build('small'), onText, maxTokens);
        return fallback.gen.done;
      });
      return {
        gen: { done, stop: () => (fallback ? fallback.gen.stop() : cloud.stop()) },
        engine: () => (fallback ? fallback.engine() : label),
      };
    },
    [mode, runPhone, phoneReady],
  );

  return (
    <Ctx.Provider
      value={{
        phase,
        model: modelById(modelId),
        progress,
        error,
        installed,
        simulated: Engine.SIMULATED,
        startDownload,
        pause,
        cancel,
        remove,
        select,
        run,
        mode,
        setMode,
        hasKey,
        setKey,
        available: (mode !== 'phone' && hasKey) || phoneReady,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAi(): AiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAi outside AiProvider');
  return v;
}

/** True when a model is on the phone and can answer (loading happens on first use). */
export const canRun = (phase: Phase) => phase === 'installed' || phase === 'ready' || phase === 'loading';
