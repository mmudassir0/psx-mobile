/** Your real portfolio at a glance (Home): value, today's change, and what needs attention. */
import { stateOf, type PriceTargets } from './targets';
import { inbox } from '../analysis/announcements';
import { resultsShort } from '../analysis/results';
import { volumeSpike } from '../analysis/activity';
import type { Candle } from '../psx/types';
import { useMemo } from 'react';
import type { Stock } from '../psx/types';
import { recentBonus, upcomingPayout } from '../analysis/dividends';
import type { Row } from './useReviews';
import { sectorShares, type SectorLimits } from './sectorLimits';
import { owedPayments, type Received } from './divPayments';
import { shortSector } from '../sectors';

export interface TodoItem {
  key: string;
  /** short text, e.g. "DGKC: buy by Fri 16 Oct for its dividend" */
  text: string;
  tone: 'down' | 'gold' | 'up' | 'plain';
  /** open this stock when tapped (otherwise My holdings) */
  symbol?: string;
  /** or open this screen */
  route?: 'Rebalance' | 'Income' | 'Announcements' | 'SectorLimits' | 'DivPayments';
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

/** The next cash dividend on your holdings for the widget, e.g. "MEBL Rs 1,200 · book closure 4 Nov". */
export function nextDividendLine(rows: Row[], now = Date.now()): string | null {
  const next = rows
    .map((r) => ({ r, up: upcomingPayout(r.dividends, now) }))
    .filter((x) => x.up && x.up.dps > 0)
    .sort((a, b) => a.up!.bookClosure - b.up!.bookClosure)[0];
  if (!next) return null;
  const amt = Math.round(next.up!.dps * next.r.holding.shares).toLocaleString('en-US');
  return `${next.r.holding.symbol} Rs ${amt} · book closure ${day(next.up!.bookClosure)}`;
}

/** "3 new announcements from your holdings" since you last opened the inbox (none the very first time). */
export function announcementItem(rows: Row[], seenAt: number, now = Date.now()): TodoItem[] {
  if (!seenAt) return [];
  const items = inbox(Object.fromEntries(rows.map((r) => [r.holding.symbol, r.announcements ?? []])), seenAt, now, 14).filter((i) => i.fresh);
  if (!items.length) return [];
  const syms = [...new Set(items.map((i) => i.symbol))];
  return [{ key: 'ann', text: `${items.length} new announcement${items.length > 1 ? 's' : ''}: ${syms.slice(0, 3).join(', ')}${syms.length > 3 ? '…' : ''}`, tone: 'plain', route: 'Announcements' }];
}

/** Dividends not ticked as received a month after book closure (on today's shares; the screen uses your records). */
export function latePaymentItems(rows: Row[], received: Record<string, Received>, now = Date.now()): TodoItem[] {
  const late = owedPayments({
    holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, taxRate: 0, list: r.dividends?.list ?? [] })),
    sharesOn: () => null,
    received,
    now,
    back: 90,
  }).filter((o) => o.status === 'late');
  if (!late.length) return [];
  const syms = [...new Set(late.map((o) => o.symbol))];
  return [{ key: `late-div-${late.map((o) => o.key).join(',')}`, text: `Dividend from ${syms.slice(0, 3).join(', ')} not ticked as received yet`, tone: 'gold', route: 'DivPayments' }];
}

/** Sectors over your own limit. */
export function sectorItems(rows: Row[], limits: SectorLimits): TodoItem[] {
  if (limits.all == null && !Object.keys(limits.per).length) return [];
  return sectorShares(
    rows.map((r) => ({ symbol: r.holding.symbol, sector: r.stock?.sector ? shortSector(r.stock.sector) : 'Other', value: r.value })),
    limits,
  )
    .filter((s) => s.over > 0)
    .map((s) => ({ key: `sector-${s.sector}`, text: `${s.sector} is ${(s.share * 100).toFixed(0)}% of your money, over your ${s.limit}% limit`, tone: 'gold' as const, route: 'SectorLimits' as const }));
}

/** Holdings past your own target or rethink price, live. */
export function targetItems(rows: Row[], targets: Record<string, PriceTargets>): TodoItem[] {
  const out: TodoItem[] = [];
  for (const r of rows) {
    const t = targets[r.holding.symbol];
    const st = stateOf(r.price, t);
    if (st === 'reached') out.push({ key: `tgt-${r.holding.symbol}`, text: `${r.holding.symbol} reached your target of Rs ${t!.target}`, tone: 'up', symbol: r.holding.symbol });
    if (st === 'broken') out.push({ key: `tgt-${r.holding.symbol}`, text: `${r.holding.symbol} is below your rethink price of Rs ${t!.rethink}`, tone: 'down', symbol: r.holding.symbol });
  }
  return out;
}
