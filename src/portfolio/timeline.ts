/**
 * Everything that happened to your portfolio, newest first: buys and sales you
 * recorded, dividends and bonus shares received, results of your holdings,
 * notes you wrote, and the days the portfolio moved 3% or more.
 */
import type { TradeRecord } from './trades';
import type { Snap } from './track';
import { trackReturns } from './track';
import type { Dividends } from '../analysis/dividends';
import type { Announcement } from '../psx/types';
import { isResults } from '../analysis/results';

export type EventKind = 'buy' | 'sell' | 'dividend' | 'bonus' | 'results' | 'note' | 'bigday' | 'start';

export interface TimelineEvent {
  day: string;
  kind: EventKind;
  title: string;
  sub?: string;
  symbol?: string;
  /** + good, − bad, 0 neutral (for colour) */
  tone: 1 | -1 | 0;
}

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;

export interface TimelineInput {
  trades: TradeRecord[];
  holdings: { symbol: string; shares: number; dividends: Dividends | null; announcements?: Announcement[] }[];
  notes: Record<string, { why: string; at: number }>;
  snaps: Snap[];
  /** shares held at the end of a day, when known */
  sharesOn: (symbol: string, day: string) => number | null;
  now?: number;
}

export function buildTimeline(x: TimelineInput): TimelineEvent[] {
  const now = x.now ?? Date.now();
  const today = pkDay(now);
  const out: TimelineEvent[] = [];
  for (const t of x.trades)
    out.push({
      day: t.day,
      kind: t.side,
      symbol: t.symbol,
      title: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.shares.toLocaleString('en-US')} ${t.symbol} at Rs ${t.price.toFixed(2)}`,
      sub: t.side === 'sell' && t.realised != null ? `${t.realised >= 0 ? 'Profit' : 'Loss'} of ${rs(Math.abs(t.realised))} on the sale` : `${rs(t.shares * t.price)}`,
      tone: t.side === 'sell' && t.realised != null ? (t.realised >= 0 ? 1 : -1) : 0,
    });
  // the earliest day Sahm knows about: payouts before it can't be placed on your shares
  const first = [x.snaps[0]?.day, ...x.trades.map((t) => t.day)].filter(Boolean).sort()[0] ?? today;
  for (const h of x.holdings) {
    for (const p of h.dividends?.list ?? []) {
      if (p.bookClosure == null) continue;
      const day = pkDay(p.bookClosure - 864e5);
      if (day < first || day > today) continue;
      const shares = x.sharesOn(h.symbol, day);
      if (!shares) continue;
      if (p.dps > 0) out.push({ day: pkDay(p.bookClosure), kind: 'dividend', symbol: h.symbol, title: `${h.symbol} dividend: Rs ${p.dps.toFixed(2)} a share`, sub: `About ${rs(p.dps * shares)} before tax on ${shares.toLocaleString('en-US')} shares`, tone: 1 });
      if (p.bonusPct > 0) out.push({ day: pkDay(p.bookClosure), kind: 'bonus', symbol: h.symbol, title: `${h.symbol}: ${p.bonusPct}% bonus shares`, sub: `About ${Math.floor((shares * p.bonusPct) / 100).toLocaleString('en-US')} new shares`, tone: 1 });
    }
    for (const a of (h.announcements ?? []).filter(isResults)) {
      if (a.date < first || a.date > today) continue;
      out.push({ day: a.date, kind: 'results', symbol: h.symbol, title: `${h.symbol} results`, sub: a.title, tone: 0 });
    }
  }
  for (const [symbol, n] of Object.entries(x.notes)) out.push({ day: pkDay(n.at), kind: 'note', symbol, title: `Note on ${symbol}`, sub: n.why, tone: 0 });
  if (x.snaps.length > 1) {
    const tr = trackReturns(x.snaps);
    for (let i = 1; i < tr.length; i++) {
      const r = (1 + tr[i].ret) / (1 + tr[i - 1].ret) - 1;
      if (Math.abs(r) >= 0.03) out.push({ day: tr[i].day, kind: 'bigday', title: `Portfolio ${r >= 0 ? 'up' : 'down'} ${(Math.abs(r) * 100).toFixed(1)}% in a day`, sub: r < 0 ? 'Big falls happen a few times a year; what matters is the reason you own each stock.' : undefined, tone: r >= 0 ? 1 : -1 });
    }
    out.push({ day: x.snaps[0].day, kind: 'start', title: 'Sahm started tracking your portfolio', tone: 0 });
  }
  const order: Record<EventKind, number> = { start: 9, bigday: 1, results: 2, dividend: 3, bonus: 3, note: 4, sell: 5, buy: 6 };
  return out.sort((a, b) => b.day.localeCompare(a.day) || order[a.kind] - order[b.kind]);
}
