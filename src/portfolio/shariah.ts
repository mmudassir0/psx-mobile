/**
 * Shariah corner: how much of the money is in Shariah-compliant shares (KMI All Share members),
 * and an estimate of the dividend purification due. Sahm doesn't know each company's
 * non-compliant income, so the share given away is a rate the user sets (one for all,
 * or per stock from their scholar's or fund's published list).
 */
import { makePref } from '../prefs';

export interface Purification {
  /** % of each dividend from compliant companies to give away */
  defaultPct: number;
  /** per-stock % (overrides the default) */
  perStock: Record<string, number>;
  /** count all of a non-compliant stock's dividend as to give away */
  nonCompliantFull: boolean;
}

export const purificationPref = makePref<Purification>('real.purification', { defaultPct: 2, perStock: {}, nonCompliantFull: true });

export const isPurification = (v: unknown): v is Purification =>
  !!v && typeof v === 'object' && typeof (v as Purification).defaultPct === 'number' && typeof (v as Purification).perStock === 'object' && typeof (v as Purification).nonCompliantFull === 'boolean';

export type Status = 'kmi30' | 'compliant' | 'not';

export interface ShariahInput {
  symbol: string;
  value: number;
  shariah: boolean;
  kmi30: boolean;
  /** cash dividends received over the period, rupees (before tax) */
  received: number;
}

export interface ShariahLine extends ShariahInput {
  status: Status;
  /** the rate applied, 0–1 */
  rate: number;
  purify: number;
  /** a per-stock rate was set */
  own: boolean;
}

export interface ShariahSummary {
  lines: ShariahLine[];
  total: number;
  compliantValue: number;
  /** 0–1 */
  compliantShare: number;
  received: number;
  purify: number;
  notCount: number;
}

export function shariahSummary(holdings: ShariahInput[], p: Purification): ShariahSummary {
  const lines = holdings.map((h): ShariahLine => {
    const status: Status = !h.shariah ? 'not' : h.kmi30 ? 'kmi30' : 'compliant';
    const own = p.perStock[h.symbol] != null;
    const rate = status === 'not' && p.nonCompliantFull ? 1 : Math.max(0, Math.min(100, own ? p.perStock[h.symbol] : p.defaultPct)) / 100;
    return { ...h, status, rate, own, purify: h.received * rate };
  });
  lines.sort((a, b) => b.value - a.value);
  const total = lines.reduce((a, l) => a + l.value, 0);
  const compliantValue = lines.filter((l) => l.status !== 'not').reduce((a, l) => a + l.value, 0);
  return {
    lines,
    total,
    compliantValue,
    compliantShare: total ? compliantValue / total : 0,
    received: lines.reduce((a, l) => a + l.received, 0),
    purify: lines.reduce((a, l) => a + l.purify, 0),
    notCount: lines.filter((l) => l.status === 'not').length,
  };
}

/**
 * Cash dividends received between two days (YYYY-MM-DD, inclusive of book closure days),
 * on the shares held the day before book closure.
 */
export function dividendsReceived(
  list: { dps: number; bookClosure: number | null }[],
  sharesOn: (day: string) => number,
  from: string,
  to: string,
): { total: number; payments: { day: string; shares: number; amount: number }[] } {
  const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
  const payments: { day: string; shares: number; amount: number }[] = [];
  for (const d of list) {
    if (!(d.dps > 0) || d.bookClosure == null) continue;
    const day = pk(d.bookClosure);
    if (day < from || day > to) continue;
    const shares = sharesOn(pk(d.bookClosure - 864e5));
    if (shares > 0) payments.push({ day, shares, amount: shares * d.dps });
  }
  return { total: payments.reduce((a, x) => a + x.amount, 0), payments };
}

export const setRate = (p: Purification, symbol: string, pct: number | null): Purification => {
  const perStock = { ...p.perStock };
  if (pct == null || !Number.isFinite(pct)) delete perStock[symbol];
  else perStock[symbol] = Math.max(0, Math.min(100, pct));
  return { ...p, perStock };
};
