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

export async function readScreenshots(key: string, images: ImagePart[], known?: (s: string) => boolean): Promise<ReadResult> {
  const text = await geminiImages(key, FLASH.id, READ_SYSTEM, `Read the holdings from these ${images.length} screenshot(s).`, images);
  return checkHoldings(text, known);
}
