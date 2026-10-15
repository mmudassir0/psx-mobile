/**
 * Online AI through Groq's free tier (OpenAI-compatible API). Used only when
 * the user has added their own free key; the request carries the stock data
 * pack and the question, nothing else. Streams with XMLHttpRequest because
 * React Native's fetch can't read a response body as it arrives.
 */
import type { ChatMessage, Generation } from './models';

export const CLOUD_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Tried in order: the second only when the first is rate-limited or unavailable. */
export const CLOUD_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
export const CLOUD_LABEL: Record<string, string> = {
  'openai/gpt-oss-120b': 'GPT-OSS 120B (online)',
  'openai/gpt-oss-20b': 'GPT-OSS 20B (online)',
};

/** Pulls the text out of a server-sent-events buffer; returns new text and the unparsed tail. */
export function parseSse(buffer: string): { text: string; rest: string; done: boolean; error: string | null } {
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
      if (j.error) error = j.error.message ?? String(j.error);
      text += j.choices?.[0]?.delta?.content ?? '';
    } catch {
      // partial or malformed line: ignore
    }
  }
  return { text, rest, done, error };
}

export class CloudError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function friendly(status: number, body: string): string {
  if (status === 401) return 'The Groq key was rejected. Check it in Settings → AI.';
  if (status === 429) return 'Groq free limit reached for now. Try again in a minute, or use the on-phone model.';
  try {
    const m = JSON.parse(body)?.error?.message;
    if (m) return `Groq: ${m}`;
  } catch {
    // not JSON
  }
  return `Groq answered ${status}`;
}

function streamOnce(key: string, model: string, messages: ChatMessage[], onText: (t: string) => void, maxTokens: number): Generation {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let pending = '';
  let text = '';
  const done = new Promise<string>((resolve, reject) => {
    const consume = () => {
      if (xhr.status && xhr.status >= 400) return;
      const chunk = xhr.responseText.slice(seen);
      seen = xhr.responseText.length;
      const r = parseSse(pending + chunk);
      pending = r.rest;
      if (r.text) {
        text += r.text;
        onText(text);
      }
      if (r.error) reject(new CloudError(`Groq: ${r.error}`, 500));
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      if (xhr.status >= 400) return reject(new CloudError(friendly(xhr.status, xhr.responseText), xhr.status));
      consume();
      resolve(text);
    };
    xhr.onerror = () => reject(new CloudError('No internet connection to Groq', 0));
    xhr.ontimeout = () => reject(new CloudError('Groq took too long to answer', 0));
    xhr.onabort = () => resolve(text);
    xhr.open('POST', CLOUD_URL);
    xhr.timeout = 90_000;
    xhr.setRequestHeader('Authorization', `Bearer ${key}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    const body: Record<string, unknown> = { model, messages, stream: true, temperature: 0.3, max_completion_tokens: maxTokens };
    if (model.startsWith('openai/gpt-oss')) {
      body.reasoning_effort = 'low';
      body.include_reasoning = false;
      body.max_completion_tokens = maxTokens + 1200; // room for its hidden reasoning
    }
    xhr.send(JSON.stringify(body));
  });
  return { done, stop: () => xhr.abort() };
}

/** Streams from the first model, falling back to the next on rate limits or outages. Reports which model answered. */
export function cloudGenerate(
  key: string,
  messages: ChatMessage[],
  onText: (t: string) => void,
  maxTokens = 900,
  onModel?: (model: string) => void,
): Generation {
  let current: Generation | null = null;
  let stopped = false;
  const done = (async () => {
    let last: unknown;
    for (const model of CLOUD_MODELS) {
      if (stopped) break;
      onModel?.(model);
      current = streamOnce(key, model, messages, onText, maxTokens);
      try {
        return await current.done;
      } catch (e) {
        last = e;
        const st = e instanceof CloudError ? e.status : 0;
        if (st !== 429 && st < 500) throw e; // bad key, bad request or offline: don't retry
      }
    }
    if (stopped) return '';
    throw last;
  })();
  return {
    done,
    stop: () => {
      stopped = true;
      current?.stop();
    },
  };
}

/** Quick key check with a one-word reply. */
export async function testKey(key: string): Promise<string> {
  const g = streamOnce(key, 'openai/gpt-oss-20b', [{ role: 'user', content: 'Reply with the single word OK.' }], () => {}, 16);
  return g.done;
}
