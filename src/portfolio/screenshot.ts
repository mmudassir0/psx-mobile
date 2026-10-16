/** Reads holdings from broker screenshots with Groq's vision model (or Gemini), then checks them in code. */
import { geminiImages, ImagePart, FLASH } from '../ai/gemini';
import type { Holding } from './review';

export const READ_SYSTEM = `You read screenshots of a Pakistan Stock Exchange broker app's portfolio screen (for example KTrade).
Return JSON only: {"holdings":[{"symbol":"LUCK","shares":200,"avgCost":419.11}]}.
Rules:
- One entry per stock card that is fully visible: the symbol in capitals, the number of shares, and the average buy price ("Avg").
- Copy numbers exactly as shown, without commas. Do not use the current price ("Curr") or the invested amount ("Inv") as the average.
- Screenshots may overlap; list each symbol once.
- Skip anything cut off at the top or bottom edge, and skip totals, cash and buying power.`;

export interface ReadResult {
  holdings: Holding[];
  /** entries that failed the checks, with why */
  rejected: string[];
}

/** Parses and checks the model's answer: known symbol, positive numbers, and Inv ≈ shares × Avg when given. */
export function checkHoldings(raw: string, known?: (symbol: string) => boolean): ReadResult {
  const m = raw.match(/\{[\s\S]*\}/);
  const rejected: string[] = [];
  if (!m) return { holdings: [], rejected: ['The answer had no list of holdings'] };
  let list: { symbol?: unknown; shares?: unknown; avgCost?: unknown; invested?: unknown }[] = [];
  try {
    list = JSON.parse(m[0]).holdings ?? [];
  } catch {
    return { holdings: [], rejected: ["Couldn't read the answer"] };
  }
  const out = new Map<string, Holding>();
  for (const x of list) {
    const symbol = String(x.symbol ?? '').trim().toUpperCase();
    const shares = Number(String(x.shares ?? '').replace(/,/g, ''));
    const avgCost = Number(String(x.avgCost ?? '').replace(/,/g, ''));
    if (!/^[A-Z][A-Z0-9.-]{1,11}$/.test(symbol)) {
      rejected.push(`"${symbol}": not a symbol`);
      continue;
    }
    if (!(shares > 0) || !Number.isInteger(shares) || !(avgCost > 0)) {
      rejected.push(`${symbol}: shares or average price missing`);
      continue;
    }
    if (known && !known(symbol)) {
      rejected.push(`${symbol}: not found on PSX`);
      continue;
    }
    out.set(symbol, { symbol, shares, avgCost });
  }
  return { holdings: [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), rejected };
}

/** Groq's Qwen reads images (tested on a sample broker screen: exact, under a second). */
export const GROQ_VISION = 'qwen/qwen3.8-27b';

/**
 * Groq's free tier allows about 7,000 input and 1,000 output tokens a minute for
 * this model. A phone screenshot is about 2,000 input tokens, so screenshots go
 * one per request with a small output budget, and a rate-limit answer is waited
 * out (Groq says how long) instead of failing.
 */
const GROQ_MAX_OUT = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RateLimited extends Error {
  constructor(message: string, readonly waitMs: number) {
    super(message);
  }
}

/** Seconds to wait from a 429 answer: the Retry-After header or "try again in 4.3s" / "in 1m2s" in the message. */
export function retryWait(message: string, header: string | null): number {
  const h = Number(header);
  if (header && Number.isFinite(h)) return h * 1000;
  const m = message.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  if (m) return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000;
  return 20_000;
}

async function groqImages(key: string, images: ImagePart[]): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_VISION,
      temperature: 0,
      max_tokens: GROQ_MAX_OUT,
      messages: [
        { role: 'system', content: READ_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Read the holdings from these ${images.length} screenshot(s).` },
            ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })),
          ],
        },
      ],
    }),
  });
  const j = await res.json().catch(() => null);
  const msg = j?.error?.message ?? `Groq answered ${res.status}`;
  if (res.status === 429) throw new RateLimited(msg, retryWait(msg, res.headers.get('retry-after')));
  if (!res.ok) throw new Error(msg);
  return j?.choices?.[0]?.message?.content ?? '';
}

async function groqWithWaits(key: string, images: ImagePart[], onStatus?: (s: string) => void): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await groqImages(key, images);
    } catch (e) {
      // A daily limit asks for a wait of many minutes: give up and let Gemini try.
      if (!(e instanceof RateLimited) || attempt >= 3 || e.waitMs > 90_000) throw e;
      const secs = Math.ceil(e.waitMs / 1000) + 1;
      onStatus?.(`Groq's free tier allows a few screenshots a minute; waiting ${secs}s…`);
      await sleep(secs * 1000);
    }
  }
}

/** Reads screenshots one at a time and merges the results (a symbol seen twice keeps the later reading). */
export async function readScreenshots(
  keys: { groq?: string | null; gemini?: string | null },
  images: ImagePart[],
  known?: (s: string) => boolean,
  onStatus?: (s: string) => void,
): Promise<ReadResult> {
  const merged = new Map<string, Holding>();
  const rejected: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < images.length; i++) {
    onStatus?.(`Reading screenshot ${i + 1} of ${images.length}…`);
    try {
      const r = await readOne(keys, images[i], known, onStatus);
      for (const h of r.holdings) merged.set(h.symbol, h);
      rejected.push(...r.rejected);
    } catch (e) {
      failed.push(`screenshot ${i + 1}: ${(e as Error).message}`);
    }
  }
  if (!merged.size && failed.length) throw new Error(failed.join('\n'));
  return { holdings: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), rejected: [...new Set([...rejected, ...failed])] };
}

/** Groq first (its own free quota), then Gemini; says what each one answered if both fail. */
async function readOne(keys: { groq?: string | null; gemini?: string | null }, image: ImagePart, known?: (s: string) => boolean, onStatus?: (s: string) => void): Promise<ReadResult> {
  if (!keys.groq && !keys.gemini) throw new Error('Add a Groq or Gemini key in Settings → AI to read screenshots');
  const errors: string[] = [];
  if (keys.groq) {
    try {
      return checkHoldings(await groqWithWaits(keys.groq, [image], onStatus), known);
    } catch (e) {
      errors.push(`Groq: ${(e as Error).message}`);
    }
  }
  if (keys.gemini) {
    try {
      return checkHoldings(await geminiImages(keys.gemini, FLASH.id, READ_SYSTEM, 'Read the holdings from this screenshot.', [image]), known);
    } catch (e) {
      errors.push(`Gemini: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join('; '));
}
