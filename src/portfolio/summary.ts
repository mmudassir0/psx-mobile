/** Your real portfolio at a glance (Home): value, today's change, and what needs attention. */
import { resultsShort } from '../analysis/results';
import { volumeSpike } from '../analysis/activity';
import type { Candle } from '../psx/types';
import { useMemo } from 'react';
import type { Stock } from '../psx/types';
import { recentBonus, upcomingPayout } from '../analysis/dividends';
import type { Row } from './useReviews';

export interface TodoItem {
  key: string;
  /** short text, e.g. "DGKC: buy by Fri 16 Oct for its dividend" */
  text: string;
  tone: 'down' | 'gold' | 'up' | 'plain';
  /** open this stock when tapped (otherwise My holdings) */
  symbol?: string;
  /** or open this screen */
  route?: 'Rebalance' | 'Income';
}

const DAY = 864e5;
const day = (t: number) => new Date(t + 5 * 3600_000).toUTCString().slice(0, 11).replace(',', '');

/** What needs a look, most urgent first; at most `max` items. */
export function todoItems(rows: Row[], applied: string[], now = Date.now(), max = 4): TodoItem[] {
  const out: TodoItem[] = [];
  const review = rows.filter((r) => r.review?.action === 'Review').map((r) => r.holding.symbol);
  const trim = rows.filter((r) => r.review?.action === 'Trim').map((r) => r.holding.symbol);
  if (review.length) out.push({ key: 'review', text: `Review ${review.join(', ')}: the business has weakened`, tone: 'down', symbol: review.length === 1 ? review[0] : undefined });
  for (const r of rows) {
    const up = upcomingPayout(r.dividends, now);
    if (up && up.bookClosure - now < 8 * DAY)
      out.push({ key: `pay-${r.holding.symbol}`, text: `${r.holding.symbol}: ${up.dps > 0 ? `Rs ${up.dps.toFixed(2)} dividend` : `${up.bonusPct}% bonus`}, book closure ${day(up.bookClosure)}`, tone: 'up', symbol: r.holding.symbol });
    const b = recentBonus(r.dividends, now);
    if (b && !applied.includes(`${r.holding.symbol}:${b.key}`) && Math.floor((r.holding.shares * b.pct) / 100) >= 1)
      out.push({ key: `bonus-${r.holding.symbol}`, text: `${r.holding.symbol}: add your ${b.pct}% bonus shares`, tone: 'gold' });
    if (r.results?.latest?.fresh) out.push({ key: `res-${r.holding.symbol}`, text: `${r.holding.symbol}: ${resultsShort(r.results.latest)}`, tone: (r.results.latest.epsChange ?? 0) < 0 ? 'down' : 'up', symbol: r.holding.symbol });
    else if (r.results?.meetingNotice) out.push({ key: `due-${r.holding.symbol}`, text: `${r.holding.symbol}: results due soon`, tone: 'plain', symbol: r.holding.symbol });
  }
  if (trim.length) out.push({ key: 'trim', text: `Trim ${trim.join(', ')}: too big a share of your money`, tone: 'gold', symbol: trim.length === 1 ? trim[0] : undefined });
  return out.slice(0, max);
}

export function usePortfolioTotals(rows: Row[], bySymbol: Map<string, Stock>) {
  return useMemo(() => {
    const total = rows.reduce((a, r) => a + r.value, 0);
    const invested = rows.reduce((a, r) => a + r.holding.shares * r.holding.avgCost, 0);
    const today = rows.reduce((a, r) => a + r.holding.shares * (bySymbol.get(r.holding.symbol)?.change ?? 0), 0);
    return { total, invested, pnl: total - invested, pnlPct: invested ? total / invested - 1 : 0, today, todayPct: total - today > 0 ? today / (total - today) : 0 };
  }, [rows, bySymbol]);
}

/**
 * Holdings trading unusually today: 3× their normal volume or more (live,
 * against the 20 sessions before today).
 */
export function activityItems(rows: Row[], candles: Record<string, Candle[] | null>, now = Date.now()): TodoItem[] {
  const today = new Date(now + 5 * 3600_000).toISOString().slice(0, 10);
  const out: TodoItem[] = [];
  for (const r of rows) {
    const c = candles[r.holding.symbol];
    const vol = r.stock?.volume;
    if (!c || !vol) continue;
    const past = c.filter((b) => new Date(b.t + 5 * 3600_000).toISOString().slice(0, 10) < today).map((b) => b.v);
    const x = volumeSpike([...past, vol]);
    if (x) {
      const pct = r.stock?.changePct;
      out.push({ key: `vol-${r.holding.symbol}`, text: `${r.holding.symbol}: ${x.toFixed(1)}× its usual volume today${pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}`, tone: 'gold', symbol: r.holding.symbol });
    }
  }
  return out;
}
