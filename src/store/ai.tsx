/**
 * App-wide state of the on-phone AI: which model is chosen, whether it is
 * downloaded, download progress (pause and resume survive app restarts), and
 * whether it is loaded into memory. Screens call `run()` to generate text.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Engine from '../ai/engine';
import { ChatMessage, Generation, LocalModel, MODELS, modelById } from '../ai/models';
import { Attempt, chain, groqAttempts } from '../ai/cloud';
import { FLASH, geminiModel, geminiStream, GeminiModel } from '../ai/gemini';
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
  /** any online key */
  hasKey: boolean;
  hasGroq: boolean;
  hasGemini: boolean;
  setKey: (k: string | null) => Promise<void>;
  setGeminiKey: (k: string | null) => Promise<void>;
  gemini: GeminiModel;
  setGemini: (key: GeminiModel['key']) => void;
  /** true when at least one engine can answer */
  available: boolean;
}

const Ctx = createContext<AiState | null>(null);
const K_MODEL = 'ai.model';
const K_RESUME = 'ai.resume';
const K_MODE = 'ai.mode';
const K_KEY = 'groq_api_key';
const K_GEMINI = 'gemini_api_key';
const K_GEMINI_MODEL = 'ai.geminiModel';

async function readSecret(name: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(name);
  } catch {
    return null; // web preview
  }
}
async function writeSecret(name: string, v: string | null): Promise<void> {
  try {
    if (v) await SecureStore.setItemAsync(name, v.trim());
    else await SecureStore.deleteItemAsync(name);
  } catch {
    // web preview has no secure store
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
  const [hasGemini, setHasGemini] = useState(false);
  const [gemini, setGeminiState] = useState<GeminiModel>(FLASH);

  useEffect(() => {
    loadKey<AiMode>(K_MODE, 'auto').then(setModeState);
    readSecret(K_KEY).then((k) => setHasKey(!!k));
    readSecret(K_GEMINI).then((k) => setHasGemini(!!k));
    loadKey<string | null>(K_GEMINI_MODEL, 'flash').then((k) => setGeminiState(geminiModel(k)));
  }, []);

  const setMode = useCallback((m: AiMode) => {
    setModeState(m);
    save(K_MODE, m);
  }, []);

  const setKey = useCallback(async (k: string | null) => {
    await writeSecret(K_KEY, k);
    setHasKey(!!k);
  }, []);

  const setGeminiKey = useCallback(async (k: string | null) => {
    await writeSecret(K_GEMINI, k);
    setHasGemini(!!k);
  }, []);

  const setGemini = useCallback((key: GeminiModel['key']) => {
    setGeminiState(geminiModel(key));
    save(K_GEMINI_MODEL, key);
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
      const [groq, gem] = mode !== 'phone' ? await Promise.all([readSecret(K_KEY), readSecret(K_GEMINI)]) : [null, null];
      if (!groq && !gem) {
        if (mode === 'online') throw new Error('Add a Gemini or Groq key in Settings → AI to use online AI');
        return runPhone(build('small'), onText, maxTokens);
      }
      // Online providers in order: chosen Gemini model, Gemini Flash, Groq; then the phone model in Auto mode.
      const large = build('large');
      const max = Math.max(maxTokens ?? 700, 700);
      const attempts: Attempt[] = [];
      if (gem) {
        const models = gemini.id === FLASH.id ? [FLASH] : [gemini, FLASH];
        for (const m of models) attempts.push({ label: `${m.label} (online)`, start: (cb) => geminiStream(gem, m.id, large, cb, max) });
      }
      if (groq) attempts.push(...groqAttempts(groq, large, max));
      if (mode === 'auto' && phoneReady) {
        attempts.push({
          label: `${modelById(modelId)?.name ?? 'Phone model'} (on phone)`,
          start: (cb) => {
            let inner: Generation | null = null;
            const done = runPhone(build('small'), cb, maxTokens).then((r) => {
              inner = r.gen;
              return r.gen.done;
            });
            return { done, stop: () => inner?.stop() };
          },
        });
      }
      let label = attempts[0].label;
      const gen = chain(attempts, onText, (l) => (label = l));
      return { gen, engine: () => label };
    },
    [mode, runPhone, phoneReady, gemini, modelId],
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
        hasKey: hasKey || hasGemini,
        hasGroq: hasKey,
        hasGemini,
        setKey,
        setGeminiKey,
        gemini,
        setGemini,
        available: (mode !== 'phone' && (hasKey || hasGemini)) || phoneReady,
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
