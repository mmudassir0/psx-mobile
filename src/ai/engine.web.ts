/**
 * Web preview stand-in for the on-phone engine (llama.rn has no web build).
 * Only used when the app is run in a browser for development: the "download"
 * fills a progress bar and answers are canned text, clearly not real analysis.
 */
import type { ChatMessage, Generation, LocalModel } from './models';

export const SIMULATED = true;
const have = new Set<string>();
let loadedId: string | null = null;

export const pathOf = (m: LocalModel) => `web-preview/${m.file}`;
export async function isDownloaded(m: LocalModel) {
  return have.has(m.id);
}
export async function freeBytes() {
  return 32e9;
}
export function download(m: LocalModel, onProgress: (f: number) => void) {
  let stopped = false;
  const done = (async () => {
    for (let i = 1; i <= 20 && !stopped; i++) {
      await new Promise((r) => setTimeout(r, 120));
      onProgress(i / 20);
    }
    if (!stopped) have.add(m.id);
  })();
  return {
    done,
    pause: async () => {
      stopped = true;
      return null;
    },
    cancel: async () => {
      stopped = true;
    },
  };
}
export async function remove(m: LocalModel) {
  have.delete(m.id);
  if (loadedId === m.id) loadedId = null;
}
export async function load(m: LocalModel, onProgress?: (f: number) => void) {
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 100));
    onProgress?.(i / 5);
  }
  loadedId = m.id;
}
export async function unload() {
  loadedId = null;
}
export function generate(messages: ChatMessage[], onText: (t: string) => void): Generation {
  const analysis = messages[messages.length - 1].content.includes('Write the analysis');
  const text = analysis
    ? '**Verdict:** Bearish — confidence Medium\n**Short term (technicals):** Web preview text. On the phone the model writes this from the data pack.\n**Levels:** entry near support, stop at the volatility stop, target at resistance.\n**Risks:**\n- Preview only.\n**News:** Nothing notable.\n_Not investment advice._'
    : 'Web preview: on the phone, the downloaded model answers this from the data Sahm sends with your question.';
  let stopped = false;
  const done = (async () => {
    let out = '';
    for (const w of text.split(' ')) {
      if (stopped) break;
      await new Promise((r) => setTimeout(r, 15));
      out += (out ? ' ' : '') + w;
      onText(out);
    }
    return out;
  })();
  return { done, stop: () => (stopped = true) };
}
