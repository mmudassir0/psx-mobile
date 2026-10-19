/**
 * The market-wide dividend calendar: every upcoming book closure the daily
 * job found among liquid and index stocks, written to calendar.json.
 */
import { lastBuyDay } from './dividends';

/** [symbol, bookClosure ms, cash Rs per share, bonus %, announced ms, price at the time] */
export type CalendarRow = [string, number, number, number, number, number];

export interface CalendarFeed {
  v: 1;
  kind: 'calendar';
  day: string;
  generatedAt: string;
  /** stocks whose payouts were checked */
  checked: number;
  rows: CalendarRow[];
}

export interface CalendarItem {
  symbol: string;
  bookClosure: number;
  lastBuyDay: number;
  dps: number;
  bonusPct: number;
  announced: number;
  price: number;
  /** this one payout as a share of the price */
  yield: number | null;
}

export function calendarItems(f: CalendarFeed | null, now = Date.now()): CalendarItem[] {
  if (!f || f.v !== 1 || f.kind !== 'calendar' || !Array.isArray(f.rows)) return [];
  return f.rows
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[1] > now - 864e5)
    .map(([symbol, bookClosure, dps, bonusPct, announced, price]) => ({
      symbol,
      bookClosure,
      lastBuyDay: lastBuyDay(bookClosure),
      dps,
      bonusPct,
      announced,
      price,
      yield: price > 0 && dps > 0 ? dps / price : null,
    }))
    .sort((a, b) => a.bookClosure - b.bookClosure || b.dps - a.dps);
}

export const isCalendarFeed = (x: unknown): x is CalendarFeed => {
  const f = x as CalendarFeed | null;
  return !!f && f.v === 1 && f.kind === 'calendar' && Array.isArray(f.rows);
};
