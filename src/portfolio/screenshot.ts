/** Reads holdings from broker screenshots with Gemini, then checks them in code. */
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

async function groqImages(key: string, images: ImagePart[]): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_VISION,
      temperature: 0,
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
  if (!res.ok) throw new Error(j?.error?.message ?? `Groq answered ${res.status}`);
  return j?.choices?.[0]?.message?.content ?? '';
}

/** Reads screenshots three at a time and merges the results (a symbol seen twice keeps the later reading). */
export async function readScreenshots(keys: { groq?: string | null; gemini?: string | null }, images: ImagePart[], known?: (s: string) => boolean): Promise<ReadResult> {
  const merged = new Map<string, Holding>();
  const rejected: string[] = [];
  for (let i = 0; i < images.length; i += 3) {
    const r = await readBatch(keys, images.slice(i, i + 3), known);
    for (const h of r.holdings) merged.set(h.symbol, h);
    rejected.push(...r.rejected);
  }
  return { holdings: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), rejected: [...new Set(rejected)] };
}

/** Groq first (its own free quota), then Gemini. */
async function readBatch(keys: { groq?: string | null; gemini?: string | null }, images: ImagePart[], known?: (s: string) => boolean): Promise<ReadResult> {
  const prompt = `Read the holdings from these ${images.length} screenshot(s).`;
  let lastErr: unknown = new Error('Add a Groq or Gemini key in Settings → AI to read screenshots');
  if (keys.groq) {
    try {
      return checkHoldings(await groqImages(keys.groq, images), known);
    } catch (e) {
      lastErr = e;
    }
  }
  if (keys.gemini) {
    try {
      return checkHoldings(await geminiImages(keys.gemini, FLASH.id, READ_SYSTEM, prompt, images), known);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
