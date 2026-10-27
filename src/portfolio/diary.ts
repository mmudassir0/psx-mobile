/**
 * Portfolio diary: one short line for each day Sahm saw your portfolio, written
 * from the daily snapshots: how it moved against the index, what led and what
 * lagged, money in or out, dividends, trades, notes and book closures that day.
 */
import { alignIndex, flowBetween, type Snap } from './track';
import type { SeriesPoint } from '../psx/types';

export interface DiaryDay {
  day: string;
  value: number;
  /** change that day excluding money added or taken out, rupees and 0–1 */
  change: number;
  pct: number;
  indexPct: number | null;
  best: { symbol: string; pct: number } | null;
  worst: { symbol: string; pct: number } | null;
  flow: number;
  dividends: number;
  /** extra notes for the day: trades, your notes, book closures */
  extra: string[];
  text: string;
}

const rs = (v: number) => `Rs ${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

export function diary(input: { snaps: Snap[]; index?: SeriesPoint[] | null; extras?: Record<string, string[]>; indexLabel?: string }): DiaryDay[] {
  const s = [...input.snaps].sort((a, b) => (a.day < b.day ? -1 : 1));
  const ix = input.index?.length
    ? alignIndex(
        input.index,
        s.map((x) => x.day),
      )
    : null;
  const out: DiaryDay[] = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    const flow = flowBetween(a, b);
    const change = b.value + b.div - a.value - flow;
    const base = a.value + flow / 2;
    const pct = base > 0 ? change / base : 0;
    // a gap of several days is fine; a jump this big is missing prices, not a real day
    if (!Number.isFinite(pct) || Math.abs(pct) > 0.4) continue;
    const moves: { symbol: string; pct: number }[] = [];
    for (const [sym, [sh, , p1]] of Object.entries(b.pos)) {
      const p0 = a.pos[sym]?.[2];
      if (sh > 0 && p0 && p1 && p0 > 0) moves.push({ symbol: sym, pct: p1 / p0 - 1 });
    }
    moves.sort((x, y) => y.pct - x.pct);
    const best = moves.length && moves[0].pct > 0 ? moves[0] : null;
    const worst = moves.length && moves[moves.length - 1].pct < 0 ? moves[moves.length - 1] : null;
    const indexPct = ix && ix[i] && ix[i - 1] ? ix[i]! / ix[i - 1]! - 1 : null;
    // anything between the last snapshot and this one belongs to this entry
    const extra = Object.entries(input.extras ?? {})
      .filter(([d]) => d > a.day && d <= b.day)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .flatMap(([, l]) => l);
    const parts: string[] = [];
    parts.push(Math.abs(pct) < 0.0005 ? 'Flat' : `${pct > 0 ? 'Up' : 'Down'} ${pc(pct).slice(1)} (${pct > 0 ? '+' : '−'}${rs(change)})`);
    if (indexPct != null) parts[0] += `, ${input.indexLabel ?? 'KSE-100'} ${pc(indexPct)}`;
    const lead = [best ? `${best.symbol} led (${pc(best.pct)})` : null, worst ? `${worst.symbol} lagged (${pc(worst.pct)})` : null].filter(Boolean).join(', ');
    if (lead) parts.push(lead);
    if (Math.abs(flow) >= 1) parts.push(flow > 0 ? `${rs(flow)} added` : `${rs(flow)} taken out`);
    if (b.div > 0) parts.push(`dividends ${rs(b.div)}`);
    parts.push(...extra);
    out.push({ day: b.day, value: b.value, change, pct, indexPct, best, worst, flow, dividends: b.div, extra, text: parts.join('. ') + '.' });
  }
  return out.reverse();
}

/** Trades, notes and book closures by day, for the diary's extra notes. */
export function diaryExtras(input: {
  trades: { day: string; symbol: string; side: 'buy' | 'sell'; shares: number }[];
  notes: { symbol: string; day: string }[];
  bookClosures: { symbol: string; day: string }[];
}): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  const add = (d: string, t: string) => (m[d] ??= []).push(t);
  for (const t of input.trades) add(t.day, `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.shares.toLocaleString('en-US')} ${t.symbol}`);
  for (const n of input.notes) add(n.day, `Note on ${n.symbol}`);
  for (const b of input.bookClosures) add(b.day, `${b.symbol} book closure`);
  return m;
}

/** Groups the days by month, newest first. */
export function byMonth(days: DiaryDay[]): [string, DiaryDay[]][] {
  const m = new Map<string, DiaryDay[]>();
  for (const d of days) m.set(d.day.slice(0, 7), [...(m.get(d.day.slice(0, 7)) ?? []), d]);
  return [...m];
}
