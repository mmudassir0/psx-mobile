/**
 * App-wide state of the online AI: the saved keys (encrypted on the phone) and
 * `run()`, which answers with the first provider that works: the chosen Gemini
 * model, Gemini Flash, then GPT-OSS 120B and 20B on Groq.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ChatMessage, Generation } from '../ai/models';
import { Attempt, chain, groqAttempts } from '../ai/cloud';
import { FLASH, geminiModel, geminiWithRetry, GeminiModel } from '../ai/gemini';
import type { Tier } from '../ai/context';
import { load as loadKey, save } from '../storage';
import { logProblem } from '../log';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Run {
  gen: Generation;
  /** which model is writing, e.g. "GPT-OSS 120B (online)" */
  engine: () => string;
  /** called each time a fallback takes over, with the new model's name */
  watch?: (cb: (label: string) => void) => void;
}

interface AiState {
  run: (build: (tier: Tier) => ChatMessage[], onText: (t: string) => void, maxTokens?: number) => Promise<Run>;
  /** any online key */
  hasKey: boolean;
  hasGroq: boolean;
  hasGemini: boolean;
  setKey: (k: string | null) => Promise<void>;
  setGeminiKey: (k: string | null) => Promise<void>;
  gemini: GeminiModel;
  setGemini: (key: GeminiModel['key']) => void;
  /** true when a key is saved, so the AI can answer */
  available: boolean;
}

const Ctx = createContext<AiState | null>(null);
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
/** The saved online-AI keys, for features outside the chat (reading screenshots). */
export async function aiKeys(): Promise<{ groq: string | null; gemini: string | null }> {
  const [groq, gemini] = await Promise.all([readSecret(K_KEY), readSecret(K_GEMINI)]);
  return { groq, gemini };
}

async function writeSecret(name: string, v: string | null): Promise<void> {
  try {
    if (v) await SecureStore.setItemAsync(name, v.trim());
    else await SecureStore.deleteItemAsync(name);
  } catch {
    // web preview has no secure store
  }
}

/**
 * Sahm used to offer an on-phone model (1–2.5 GB). It was removed in 0.36; this frees the
 * space a downloaded model (or a half-finished download) still takes.
 */
async function removeOldPhoneModel() {
  if (Platform.OS === 'web') return;
  try {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}models/`, { idempotent: true });
    await AsyncStorage.multiRemove(['ai.model', 'ai.resume', 'ai.mode']);
  } catch {
    // nothing there
  }
}

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState(false);
  const [hasGemini, setHasGemini] = useState(false);
  const [gemini, setGeminiState] = useState<GeminiModel>(FLASH);

  useEffect(() => {
    readSecret(K_KEY).then((k) => setHasKey(!!k));
    readSecret(K_GEMINI).then((k) => setHasGemini(!!k));
    loadKey<string | null>(K_GEMINI_MODEL, 'flash').then((k) => setGeminiState(geminiModel(k)));
    removeOldPhoneModel();
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

  const run = useCallback(
    async (build: (tier: Tier) => ChatMessage[], onText: (t: string) => void, maxTokens?: number): Promise<Run> => {
      const [groq, gem] = await Promise.all([readSecret(K_KEY), readSecret(K_GEMINI)]);
      if (!groq && !gem) throw new Error('Add a free Groq key in Settings → AI to use the AI');
      // Online providers in order: chosen Gemini model, Gemini Flash, Groq.
      const large = build('large');
      const max = Math.max(maxTokens ?? 700, 700);
      const attempts: Attempt[] = [];
      if (gem) {
        const models = gemini.id === FLASH.id ? [FLASH] : [gemini, FLASH];
        for (const m of models) attempts.push({ label: `${m.label} (online)`, start: (cb) => geminiWithRetry(gem, m.id, large, cb, max) });
      }
      if (groq) attempts.push(...groqAttempts(groq, large, max));
      let label = attempts[0].label;
      let listener: ((l: string) => void) | null = null;
      const gen = chain(attempts, onText, (l) => {
        label = l;
        listener?.(l);
      });
      // every provider failed: worth seeing later (a side branch, the caller still gets the error)
      gen.done.catch((e) => logProblem('AI answer', e));
      return { gen, engine: () => label, watch: (cb) => (listener = cb) };
    },
    [gemini],
  );

  return (
    <Ctx.Provider
      value={{
        run,
        hasKey: hasKey || hasGemini,
        hasGroq: hasKey,
        hasGemini,
        setKey,
        setGeminiKey,
        gemini,
        setGemini,
        available: hasKey || hasGemini,
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

