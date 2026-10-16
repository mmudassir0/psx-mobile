/**
 * Gemini through Google's Interactions API, with the user's own API key
 * (free tier, or billed to their Google Cloud project and its Developer
 * Program credits). Streams server-sent events with XMLHttpRequest.
 */
import type { ChatMessage, Generation } from './models';
import { CloudError } from './cloud';

/** Give up when Gemini sends nothing for this long. */
export const IDLE_MS = 90_000;

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';

export interface GeminiModel {
  id: string;
  key: 'flash' | 'pro' | 'argon';
  label: string;
  note: string;
}

export const GEMINI_MODELS: GeminiModel[] = [
  { id: 'gemini-3.8-flash', key: 'flash', label: 'Gemini 3.8 Flash', note: 'Fast and very capable; works on the free tier.' },
  { id: 'gemini-3.1-pro-preview', key: 'pro', label: 'Gemini 3.1 Pro', note: 'Deeper reasoning; may need billing or credits.' },
  { id: 'gemini-4-argon', key: 'argon', label: 'Gemini 4 Argon', note: "Google's flagship; needs billing or credits." },
];
export const FLASH = GEMINI_MODELS[0];
export const geminiModel = (key: string | null | undefined) => GEMINI_MODELS.find((m) => m.key === key) ?? FLASH;

/** Reads text deltas from an Interactions SSE buffer; returns new text, the unparsed tail, and any error. */
export function parseInteractionSse(buffer: string): { text: string; rest: string; done: boolean; error: string | null } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  let text = '';
  let done = false;
  let error: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const j = JSON.parse(payload);
      if (j.event_type === 'error' || j.error) error = j.error?.message ?? 'Gemini error';
      else if (j.event_type === 'step.delta' && j.delta?.type === 'text' && typeof j.delta.text === 'string') text += j.delta.text;
      else if (j.event_type === 'interaction.completed') done = true;
    } catch {
      // partial or unknown event: skip, as Google's docs advise
    }
  }
  return { text, rest, done, error };
}

/** The Interactions API takes one system instruction and one input; earlier turns are folded into the input. */
export function toInteraction(messages: ChatMessage[]): { system: string; input: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  const last = turns[turns.length - 1]?.content ?? '';
  const earlier = turns.slice(0, -1);
  if (!earlier.length) return { system, input: last };
  const history = earlier.map((m) => `${m.role === 'user' ? 'Earlier question' : 'Your earlier answer'}: ${m.content}`).join('\n\n');
  return { system, input: `${history}\n\nNew question: ${last}` };
}

function friendly(status: number, body: string): string {
  if (status === 400 && /api key/i.test(body)) return 'The Gemini key was rejected. Check it in Settings → AI.';
  if (status === 401 || status === 403) return 'Gemini refused this key or model. Check the key, or pick Gemini Flash in Settings → AI.';
  if (status === 429) return 'Gemini limit reached for now.';
  if (status === 404) return 'This Gemini model is not available to your key.';
  try {
    const m = JSON.parse(body)?.error?.message;
    if (m) return `Gemini: ${m}`;
  } catch {
    // not JSON
  }
  return `Gemini answered ${status}`;
}

/** The exact request body Sahm sends. */
export function interactionBody(model: string, messages: ChatMessage[], maxTokens: number) {
  const { system, input } = toInteraction(messages);
  return {
    model,
    system_instruction: system,
    input,
    stream: true,
    store: false,
    generation_config: { thinking_level: 'low', max_output_tokens: maxTokens + 2000 },
  };
}

export function geminiStream(
  key: string,
  model: string,
  messages: ChatMessage[],
  onText: (t: string) => void,
  maxTokens: number,
): Generation {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let pending = '';
  let text = '';
  // Gemini can think for a while before the first words, so instead of a cap on
  // the whole answer, give up only when nothing has arrived for IDLE_MS.
  let idle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const kick = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      timedOut = true;
      xhr.abort();
    }, IDLE_MS);
  };
  const done = new Promise<string>((resolve, reject) => {
    const consume = () => {
      if (xhr.status && xhr.status >= 400) return;
      const chunk = xhr.responseText.slice(seen);
      seen = xhr.responseText.length;
      const r = parseInteractionSse(pending + chunk);
      pending = r.rest;
      if (r.text) {
        text += r.text;
        onText(text);
      }
      if (r.error) reject(new CloudError(`Gemini: ${r.error}`, 500));
    };
    xhr.onprogress = () => {
      kick();
      consume();
    };
    xhr.onload = () => {
      if (idle) clearTimeout(idle);
      if (xhr.status >= 400) return reject(new CloudError(friendly(xhr.status, xhr.responseText), xhr.status === 404 || xhr.status === 403 ? 429 : xhr.status));
      consume();
      resolve(text);
    };
    xhr.onerror = () => {
      if (idle) clearTimeout(idle);
      reject(new CloudError('No internet connection to Gemini', 0));
    };
    xhr.onabort = () => {
      if (idle) clearTimeout(idle);
      if (timedOut && !text) reject(new CloudError('Gemini took too long to answer', 0));
      else resolve(text);
    };
    xhr.open('POST', GEMINI_URL);
    kick();
    xhr.setRequestHeader('x-goog-api-key', key);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(interactionBody(model, messages, maxTokens)));
  });
  return { done, stop: () => xhr.abort() };
}

const busy = (e: unknown) => e instanceof CloudError && e.status === 503;

/**
 * Gemini Flash often answers 503 "high demand" for a moment; one retry after
 * a short pause usually gets through, before falling back to another provider.
 */
export function geminiWithRetry(
  key: string,
  model: string,
  messages: ChatMessage[],
  onText: (t: string) => void,
  maxTokens: number,
  pauseMs = 2000,
): Generation {
  let current = geminiStream(key, model, messages, onText, maxTokens);
  let stopped = false;
  const done = current.done.catch(async (e) => {
    if (!busy(e) || stopped) throw e;
    await new Promise((r) => setTimeout(r, pauseMs));
    if (stopped) return '';
    current = geminiStream(key, model, messages, onText, maxTokens);
    return current.done;
  });
  return {
    done,
    stop: () => {
      stopped = true;
      current.stop();
    },
  };
}

/**
 * Quick key check with Gemini Flash. Resolves 'ok', or 'busy' when Google is
 * overloaded (the key itself was accepted); throws when the key is refused.
 */
export async function testGeminiKey(key: string): Promise<'ok' | 'busy'> {
  try {
    await geminiWithRetry(key, FLASH.id, [{ role: 'user', content: 'Reply with the single word OK.' }], () => {}, 16).done;
    return 'ok';
  } catch (e) {
    if (busy(e)) return 'busy';
    throw e;
  }
}

export interface ImagePart {
  /** base64, no data: prefix */
  data: string;
  mime: string;
}

/**
 * One Gemini request with images (Interactions API: input as text and image
 * parts). Returns the whole answer text. Used to read broker screenshots.
 */
export function geminiImages(key: string, model: string, system: string, prompt: string, images: ImagePart[], maxTokens = 4000): Promise<string> {
  const body = {
    model,
    system_instruction: system,
    input: [{ type: 'text', text: prompt }, ...images.map((im) => ({ type: 'image', data: im.data, mime_type: im.mime }))],
    stream: true,
    store: false,
    generation_config: { thinking_level: 'low', max_output_tokens: maxTokens },
  };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status >= 400) return reject(new CloudError(friendly(xhr.status, xhr.responseText), xhr.status));
      const r = parseInteractionSse(xhr.responseText + '\n');
      if (r.error) return reject(new CloudError(`Gemini: ${r.error}`, 500));
      resolve(r.text);
    };
    xhr.onerror = () => reject(new CloudError('No internet connection to Gemini', 0));
    xhr.ontimeout = () => reject(new CloudError('Gemini took too long to answer', 0));
    xhr.open('POST', GEMINI_URL);
    xhr.timeout = 180_000;
    xhr.setRequestHeader('x-goog-api-key', key);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(body));
  });
}
