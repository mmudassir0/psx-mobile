/**
 * On-phone inference with llama.cpp (via llama.rn). The model file is
 * downloaded once into the app's own storage; nothing leaves the phone.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { initLlama, LlamaContext } from 'llama.rn';
import type { ChatMessage, Generation, LocalModel } from './models';

const DIR = `${FileSystem.documentDirectory}models/`;
export const pathOf = (m: LocalModel) => DIR + m.file;

export const SIMULATED = false;

export async function isDownloaded(m: LocalModel): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(pathOf(m));
  return info.exists && !info.isDirectory && info.size === m.bytes;
}

export async function freeBytes(): Promise<number | null> {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

export interface Download {
  done: Promise<void>;
  pause: () => Promise<string | null>;
  cancel: () => Promise<void>;
}

/** Starts or resumes (from a saved resume token) a model download. */
export function download(m: LocalModel, onProgress: (fraction: number) => void, resumeData?: string | null): Download {
  const dest = pathOf(m);
  const part = dest + '.part';
  const cb = (p: FileSystem.DownloadProgressData) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : m.bytes;
    onProgress(Math.min(1, p.totalBytesWritten / total));
  };
  const dl = FileSystem.createDownloadResumable(m.url, part, {}, cb, resumeData ?? undefined);
  const done = (async () => {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const res = resumeData ? await dl.resumeAsync() : await dl.downloadAsync();
    if (!res) return; // paused
    if (res.status && res.status >= 400) {
      await FileSystem.deleteAsync(part, { idempotent: true });
      throw new Error(`Download failed (HTTP ${res.status})`);
    }
    const info = await FileSystem.getInfoAsync(part);
    if (!info.exists || info.size !== m.bytes) {
      await FileSystem.deleteAsync(part, { idempotent: true });
      throw new Error('The download was incomplete. Please try again.');
    }
    await FileSystem.moveAsync({ from: part, to: dest });
  })();
  return {
    done,
    pause: async () => {
      const s = await dl.pauseAsync();
      return s.resumeData ?? null;
    },
    cancel: async () => {
      await dl.pauseAsync().catch(() => null);
      await FileSystem.deleteAsync(part, { idempotent: true });
    },
  };
}

export async function remove(m: LocalModel): Promise<void> {
  if (loadedId === m.id) await unload();
  await FileSystem.deleteAsync(pathOf(m), { idempotent: true });
  await FileSystem.deleteAsync(pathOf(m) + '.part', { idempotent: true });
}

let ctx: LlamaContext | null = null;
let loadedId: string | null = null;
let loading: Promise<void> | null = null;

/** Loads the model into memory once; later calls reuse it. */
export function load(m: LocalModel, onProgress?: (fraction: number) => void): Promise<void> {
  if (loadedId === m.id && ctx) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    await unload();
    ctx = await initLlama(
      {
        model: pathOf(m),
        n_ctx: 4096,
        n_batch: 256,
        n_threads: 4, // Helio G99: 2 big + 6 small cores; 4 threads is the sweet spot
        n_gpu_layers: 0,
        use_mlock: false,
      },
      (p) => onProgress?.(p / 100),
    );
    loadedId = m.id;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export async function unload(): Promise<void> {
  const c = ctx;
  ctx = null;
  loadedId = null;
  if (c) await c.release().catch(() => {});
}

const STOP = ['<|im_end|>', '<|endoftext|>', '</s>', '<|eot_id|>'];

/** Streams a chat completion; `onText` receives the text so far. */
export function generate(messages: ChatMessage[], onText: (text: string) => void, maxTokens = 700): Generation {
  if (!ctx) throw new Error('The AI model is not loaded');
  const c = ctx;
  let text = '';
  const done = c
    .completion(
      { messages, n_predict: maxTokens, temperature: 0.2, top_p: 0.9, penalty_repeat: 1.1, stop: STOP },
      (d) => {
        text += d.token;
        onText(text);
      },
    )
    .then((r) => r.content ?? r.text ?? text);
  return { done, stop: () => void c.stopCompletion() };
}
