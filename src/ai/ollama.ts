/**
 * Client for an Ollama server, normally running in Termux on the same phone
 * (http://127.0.0.1:11434). React Native's fetch can't stream response bodies,
 * so chat streaming uses XMLHttpRequest progress events and parses Ollama's
 * newline-delimited JSON as it arrives.
 */
export const DEFAULT_URL = 'http://127.0.0.1:11434';
export const SUGGESTED_MODEL = 'qwen2.5:3b';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelInfo {
  name: string;
  sizeGB: number;
}

const trim = (url: string) => url.replace(/\/+$/, '');

/** Installed models, or throws if the server isn't reachable. */
export async function listModels(url: string, timeoutMs = 4000): Promise<ModelInfo[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${trim(url)}/api/tags`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
    const data = (await res.json()) as { models?: { name: string; size?: number }[] };
    return (data.models ?? []).map((m) => ({ name: m.name, sizeGB: (m.size ?? 0) / 1e9 }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Ollama is not responding');
    throw new Error((e as Error).message.includes('Ollama') ? (e as Error).message : 'Ollama is not running');
  } finally {
    clearTimeout(timer);
  }
}

/** Pick a model: the saved one if installed, else the suggested one, else the smallest installed. */
export function chooseModel(models: ModelInfo[], saved: string | null): string | null {
  if (saved && models.some((m) => m.name === saved)) return saved;
  const suggested = models.find((m) => m.name.startsWith(SUGGESTED_MODEL));
  if (suggested) return suggested.name;
  return [...models].sort((a, b) => a.sizeGB - b.sizeGB)[0]?.name ?? null;
}

export interface StreamHandle {
  cancel: () => void;
  done: Promise<string>;
}

/** Splits accumulated NDJSON text into complete objects; returns them and the unparsed tail. */
export function parseNdjson(buffer: string): { items: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const items: unknown[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      items.push(JSON.parse(t));
    } catch {
      // a malformed line: skip it rather than stop the answer
    }
  }
  return { items, rest };
}

/**
 * Streams a chat completion. `onToken` receives the full text so far.
 * Temperature is low: the model should explain the numbers, not improvise.
 */
export function streamChat(
  url: string,
  model: string,
  messages: ChatMessage[],
  onToken: (textSoFar: string) => void,
  options: { temperature?: number; numCtx?: number } = {},
): StreamHandle {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let pending = '';
  let text = '';
  let finished = false;

  const done = new Promise<string>((resolve, reject) => {
    const consume = () => {
      const chunk = xhr.responseText.slice(seen);
      seen = xhr.responseText.length;
      const { items, rest } = parseNdjson(pending + chunk);
      pending = rest;
      for (const it of items as { message?: { content?: string }; done?: boolean; error?: string }[]) {
        if (it.error) {
          finished = true;
          reject(new Error(it.error));
          return;
        }
        if (it.message?.content) {
          text += it.message.content;
          onToken(text);
        }
        if (it.done) finished = true;
      }
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      if (pending.trim()) {
        const { items } = parseNdjson(pending + '\n');
        for (const it of items as { message?: { content?: string } }[]) if (it.message?.content) text += it.message.content;
        onToken(text);
      }
      if (xhr.status >= 400) reject(new Error(`Ollama answered ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      else resolve(text);
    };
    xhr.onerror = () => reject(new Error(finished ? 'Connection closed' : 'Lost connection to Ollama'));
    xhr.onabort = () => resolve(text);
    xhr.open('POST', `${trim(url)}/api/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(
      JSON.stringify({
        model,
        messages,
        stream: true,
        keep_alive: '10m',
        options: { temperature: options.temperature ?? 0.2, num_ctx: options.numCtx ?? 4096 },
      }),
    );
  });

  return { cancel: () => xhr.abort(), done };
}
