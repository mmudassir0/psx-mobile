/**
 * Spoken questions for the AI: the phone records, Groq's Whisper turns it into
 * text , and the text goes to the AI like a typed question.
 * Uses your Groq key; the recording is sent only to Groq and not kept.
 */
export const WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
export const TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Words Whisper should expect, so symbols come out right ("LUCK", not "luck"). */
export function voicePrompt(symbols: string[]): string {
  return `Pakistan Stock Exchange, PSX, KSE-100, KMI-30, dividend, P/E. ${symbols.slice(0, 30).join(', ')}`;
}

/** Whisper writes symbols as words sometimes: put known symbols back in capitals. */
export function tidyTranscript(text: string, symbols: string[]): string {
  let t = text.trim().replace(/\s+/g, ' ');
  for (const s of symbols) t = t.replace(new RegExp(`\\b${s.replace(/[^A-Za-z0-9]/g, '')}\\b`, 'gi'), s);
  return t;
}

export async function transcribe(uri: string, key: string, opts: { lang?: string | null; symbols?: string[]; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  let lastErr = '';
  for (const model of WHISPER_MODELS) {
    const form = new FormData();
    form.append('file', { uri, name: 'question.m4a', type: 'audio/m4a' } as unknown as Blob);
    form.append('model', model);
    form.append('response_format', 'json');
    if (opts.lang) form.append('language', opts.lang);
    if (opts.symbols?.length) form.append('prompt', voicePrompt(opts.symbols));
    const res = await f(TRANSCRIBE_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (res.ok) {
      const j = (await res.json()) as { text?: string };
      return tidyTranscript(j.text ?? '', opts.symbols ?? []);
    }
    lastErr = `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`;
    // a retired model: try the next; anything else (bad key, too long) won't get better
    if (res.status !== 404 && !/model/i.test(lastErr)) break;
  }
  throw new Error(`Couldn't turn the recording into text (${lastErr})`);
}
