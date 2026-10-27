/**
 * Dividend payments you're owed, from book closures already past, to tick off as
 * they reach your bank. One not ticked a month after book closure is worth
 * chasing (wrong bank details with the company's registrar, or the CDC account).
 */
import { makePref } from '../prefs';

export interface Received {
  /** when you ticked it, epoch ms */
  at: number;
  /** what actually arrived, if you typed it */
  amount?: number | null;
}

/** key `SYMBOL:YYYY-MM-DD` (book closure day) */
export const receivedPref = makePref<Record<string, Received>>('real.divReceived', {});

export const isReceived = (v: unknown): v is Record<string, Received> => !!v && typeof v === 'object' && Object.values(v as object).every((x) => !!x && typeof (x as Received).at === 'number');

export interface Owed {
  key: string;
  symbol: string;
  /** book closure day */
  day: string;
  shares: number;
  dps: number;
  gross: number;
  net: number;
  /** shares from your records at the time, or today's holding */
  assumed: boolean;
  received: Received | null;
  /** days since book closure */
  age: number;
  status: 'received' | 'waiting' | 'late';
}

/** Days after book closure before an unticked payment counts as late. */
export const LATE_DAYS = 30;

const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function owedPayments(input: {
  holdings: { symbol: string; shares: number; taxRate: number; list: { dps: number; bookClosure: number | null }[] }[];
  /** shares held at the end of a day, when known */
  sharesOn: (symbol: string, day: string) => number | null;
  received: Record<string, Received>;
  now: number;
  /** how far back, days */
  back?: number;
}): Owed[] {
  const today = pk(input.now);
  const since = pk(input.now - (input.back ?? 400) * 864e5);
  const out: Owed[] = [];
  for (const h of input.holdings)
    for (const p of h.list) {
      if (!(p.dps > 0) || p.bookClosure == null) continue;
      const day = pk(p.bookClosure);
      if (day > today || day < since) continue;
      const before = pk(p.bookClosure - 864e5);
      const known = input.sharesOn(h.symbol, before);
      const shares = known ?? h.shares;
      if (!(shares > 0)) continue;
      const key = `${h.symbol}:${day}`;
      const received = input.received[key] ?? null;
      const age = Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 864e5);
      const gross = shares * p.dps;
      out.push({ key, symbol: h.symbol, day, shares, dps: p.dps, gross, net: gross * (1 - h.taxRate), assumed: known == null, received, age, status: received ? 'received' : age > LATE_DAYS ? 'late' : 'waiting' });
    }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.symbol.localeCompare(b.symbol)));
}

export const tick = (all: Record<string, Received>, key: string, amount: number | null = null, now = Date.now()) => ({ ...all, [key]: { at: now, amount } });
export function untick(all: Record<string, Received>, key: string) {
  const { [key]: _gone, ...rest } = all;
  return rest;
}

export function owedSummary(list: Owed[]) {
  const sum = (l: Owed[]) => l.reduce((a, o) => a + (o.received?.amount ?? o.net), 0);
  return {
    received: sum(list.filter((o) => o.status === 'received')),
    waiting: sum(list.filter((o) => o.status === 'waiting')),
    late: list.filter((o) => o.status === 'late'),
  };
}
