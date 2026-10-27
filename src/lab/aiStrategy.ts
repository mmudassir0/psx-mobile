/** Turns a strategy described in words into the lab's rules, with the online AI. Pure: the prompt and the reading of the reply. */
import type { ChatMessage } from '../ai/models';
import { METRICS, type Strategy } from './engine';
import { toStrategy } from './describe';

export function labPrompt(words: string, current: Strategy): ChatMessage[] {
  const metrics = Object.entries(METRICS)
    .map(([k, m]) => `- ${k}: ${m.label} (${m.unit}). ${m.hint}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: `You turn an investing idea for the Pakistan Stock Exchange into rules for a backtest. Reply with one JSON object only, no other text.

Fields:
- name: short name, at most 4 words
- universe: "all" (liquid PSX stocks), "kse100", "kmi30" or "shariah"
- minValue: Rs million traded a day at least (0 to 50; use 2 unless asked)
- filters: list of {"m": metric, "op": ">" or "<", "v": number}; all must pass. Use the units below (percent as numbers like 6 for 6%).
- rank: metric to choose the best by; desc: true for highest first, false for lowest first
- hold: how many stocks (1 to 50)
- every: months between checks: 1, 3, 6 or 12
- weight: "equal" or "lowvol"
- perSector: most stocks from one sector, 0 for no limit
- stop: sell when this far under the best price since buying, as a fraction (0.2 = 20%), 0 for none
- exit200: true to sell when the price drops under its 200-day average
- topSectors: for sector rotation, how many sectors to pick first (best average of the rank metric), then the best stocks in them; leave out otherwise
- from: start year (2018 or later), lump: rupees to start, monthly: rupees a month (keep the current values unless asked)
- note: one short sentence on anything you had to assume or couldn't do

Metrics:
${metrics}

Only what these fields can express is possible. If the idea needs something else (news, sectors by name, earnings growth), get as close as you can and say so in note.`,
    },
    { role: 'user', content: `Current settings: ${JSON.stringify({ from: current.from, lump: current.lump, monthly: current.monthly, universe: current.universe })}\n\nIdea: ${words.trim()}` },
  ];
}

/** The strategy in the AI's reply, merged over the current one; null if there's no usable JSON. */
export function readLabReply(reply: string, current: Strategy): { strategy: Strategy; note: string | null } | null {
  const a = reply.indexOf('{');
  const b = reply.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(reply.slice(a, b + 1));
  } catch {
    return null;
  }
  const merged = toStrategy({ ...current, ...j, id: current.id }, current.id);
  if (!merged) return null;
  return { strategy: merged, note: typeof j.note === 'string' && j.note.trim() ? j.note.trim().slice(0, 300) : null };
}
