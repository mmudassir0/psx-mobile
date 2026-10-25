/**
 * The weekly brief: this week's facts about your holdings and the market,
 * written up by your own AI (Gemini or Groq key, or the phone model). The AI
 * is given only these facts and asked not to invent anything or give orders.
 */
import type { ChatMessage } from '../ai/models';
import type { Candle } from '../psx/types';
import { upcomingPayout } from '../analysis/dividends';
import { resultsLine } from '../analysis/results';
import { moodLabel } from '../analysis/mood';
import { makePref } from '../prefs';
import type { Row } from './useReviews';

export interface Brief {
  /** the Friday (or last trading day) the week ends on, YYYY-MM-DD */
  week: string;
  text: string;
  engine: string;
  at: number;
}
export const briefPref = makePref<Brief | null>('real.weeklyBrief', null);

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** The week a brief covers: the Friday of the current PSX week (Saturday/Sunday belong to the week just ended). */
export function weekOf(now = Date.now()): string {
  const d = new Date(now + 5 * 3600_000);
  const wd = d.getUTCDay();
  const toFri = wd === 6 ? -1 : wd === 0 ? -2 : 5 - wd;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + toFri)).toISOString().slice(0, 10);
}

/** Friday after 4:30 pm or the weekend: the week's trading is over. */
export function weekOver(now = Date.now()): boolean {
  const d = new Date(now + 5 * 3600_000);
  const wd = d.getUTCDay();
  return wd === 6 || wd === 0 || (wd === 5 && d.getUTCHours() * 60 + d.getUTCMinutes() >= 16 * 60 + 30);
}

const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

/** Change over the last 5 sessions, from daily closes. */
function weekChange(c: Candle[] | null | undefined): number | null {
  if (!c || c.length < 6) return null;
  const a = c[c.length - 6].c;
  return a > 0 ? c[c.length - 1].c / a - 1 : null;
}

export function weeklyFacts(
  rows: Row[],
  candles: Record<string, Candle[] | null>,
  opts: { mood: number | null; indexWeek: number | null; breadth: number | null; now?: number; news?: { t: number; title: string; source: string; symbols: string[]; market: boolean }[] },
): string {
  const now = opts.now ?? Date.now();
  const total = rows.reduce((a, r) => a + r.value, 0);
  const lines: string[] = [];
  lines.push(`Week ending ${weekOf(now)}.`);
  if (opts.indexWeek != null) lines.push(`KSE-100 this week: ${pc(opts.indexWeek)}.`);
  if (opts.mood != null) lines.push(`Market mood (0 fear, 100 greed): ${opts.mood}, ${moodLabel(opts.mood)}.`);
  if (opts.breadth != null) lines.push(`Liquid stocks above their 200-day average: ${Math.round(opts.breadth * 100)}%.`);
  const moves = rows.map((r) => ({ r, w: weekChange(candles[r.holding.symbol]) }));
  const port = moves.reduce((a, m) => a + (m.w ?? 0) * (m.r.value / (total || 1)), 0);
  lines.push(`Portfolio: Rs ${Math.round(total).toLocaleString('en-US')} in ${rows.length} holdings, about ${pc(port)} this week from price moves.`);
  lines.push('Holdings (symbol, share of portfolio, this week, Sahm rating, notes):');
  for (const { r, w } of moves.sort((a, b) => b.r.value - a.r.value)) {
    const notes: string[] = [];
    if (r.review) notes.push(`${r.review.action}${r.review.watch ? ' (watch)' : ''}: ${r.review.headline}`);
    const up = upcomingPayout(r.dividends, now);
    if (up) notes.push(`payout coming: ${up.dps > 0 ? `Rs ${up.dps.toFixed(2)}/share` : ''}${up.bonusPct ? ` ${up.bonusPct}% bonus` : ''}, last day to buy ${pkDay(up.lastBuyDay)}`);
    if (r.results?.latest?.fresh) notes.push(resultsLine(r.results.latest));
    else if (r.results?.meetingNotice) notes.push('board meeting called, results due soon');
    lines.push(`- ${r.holding.symbol}, ${((r.value / (total || 1)) * 100).toFixed(1)}%, ${w == null ? 'n/a' : pc(w)}${notes.length ? `; ${notes.join('; ')}` : ''}`);
  }
  // headlines this week about the holdings, and the biggest market ones, so the note can say why things moved
  const held = new Set(rows.map((r) => r.holding.symbol));
  const week = (opts.news ?? []).filter((n) => now - n.t < 7 * 864e5);
  const about = week.filter((n) => n.symbols.some((s) => held.has(s))).slice(0, 8);
  const market = week.filter((n) => n.market && !about.includes(n)).slice(0, 6);
  if (about.length || market.length) {
    lines.push('Headlines this week (title only; the story itself was not read):');
    for (const n of [...about, ...market]) lines.push(`- ${pkDay(n.t)} ${n.source}: ${n.title}${n.symbols.length ? ` [${n.symbols.join(', ')}]` : ''}`);
  }
  return lines.join('\n');
}

export const BRIEF_SYSTEM = `You write a short weekly note about the user's Pakistan Stock Exchange portfolio inside the Sahm app.
The user invests for about five years. Use only the facts given; never invent prices, news or reasons. If a reason for a move isn't in the facts, don't guess one.
Write in plain English, under 180 words, no headings, no tables:
1. One or two sentences on the week: the portfolio against the KSE-100 and the market mood.
2. The two or three things that mattered most: biggest movers, results out, anything rated Review or Trim. If a headline clearly relates to a move, you may connect them, saying it was in the news; don't claim it caused the move.
3. What to look at next week: payouts with their last day to buy, results due.
Don't tell the user to buy or sell; say what Sahm's ratings say and what to check. Use Rs and %, round numbers.`;

export function briefMessages(facts: string): ChatMessage[] {
  return [
    { role: 'system', content: BRIEF_SYSTEM },
    { role: 'user', content: facts },
  ];
}
