/**
 * Your cash dividends for the next 12 months (365 days), month by month.
 *
 * - Announced: a dividend whose book closure is still ahead. The amount is
 *   known; it is paid about two weeks after book closure.
 * - Expected: each dividend a company paid in the last 12 months, assumed to
 *   come again a year later at the same amount. Companies whose dividend was
 *   cut are left out of the estimate.
 *
 * Shares are today's; tax withheld follows your filer status and the payer.
 */
import { dividendTaxRate, payerKind, type Dividends, type TaxStatus } from '../analysis/dividends';

const DAY = 864e5;
const YEAR = 365 * DAY;
/** PSX companies pay cash dividends within about 15 working days of book closure. */
export const PAY_AFTER_BOOK_CLOSURE = 15 * DAY;
/** When the book closure isn't known, it usually falls about three weeks after the announcement. */
const BOOK_AFTER_ANNOUNCED = 21 * DAY;

export interface IncomeRow {
  symbol: string;
  shares: number;
  sector: string | null;
  dividends: Dividends | null;
}

export interface IncomeItem {
  symbol: string;
  /** expected payment date, epoch ms */
  t: number;
  /** YYYY-MM in Pakistan */
  month: string;
  dps: number;
  shares: number;
  gross: number;
  net: number;
  known: boolean;
}

export interface IncomePlan {
  items: IncomeItem[];
  months: { month: string; gross: number; net: number; known: number }[];
  gross: number;
  net: number;
  /** symbols left out of the estimate because their dividend was cut */
  cut: string[];
  /** symbols that paid nothing in the last year */
  none: string[];
}

const monthOf = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 7);

/** Every month from `now` to a year later, as YYYY-MM (13 when the year ends part-way through a month). */
export function nextMonths(now: number): string[] {
  const d = new Date(now + 5 * 3600_000);
  const end = monthOf(now + YEAR);
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    out.push(m);
    if (m === end) break;
  }
  return out;
}

export function incomePlan(rows: IncomeRow[], status: TaxStatus, now = Date.now()): IncomePlan {
  const months = nextMonths(now);
  // the next 365 days: a year of every company's dividends, however the months fall
  const inWindow = (t: number) => t >= now - PAY_AFTER_BOOK_CLOSURE && t <= now + YEAR;
  const items: IncomeItem[] = [];
  const cut: string[] = [];
  const none: string[] = [];
  for (const r of rows) {
    const d = r.dividends;
    if (!d || !(r.shares > 0)) continue;
    const rate = dividendTaxRate(status, payerKind(r.sector));
    const push = (t: number, dps: number, known: boolean) => {
      const gross = dps * r.shares;
      items.push({ symbol: r.symbol, t, month: monthOf(t), dps, shares: r.shares, gross, net: gross * (1 - rate), known });
    };
    const cash = d.list.filter((p) => p.dps > 0);
    // announced and not yet paid (book closure ahead, or just passed and the money not in yet)
    const known = cash.filter((p) => p.bookClosure != null && p.bookClosure + PAY_AFTER_BOOK_CLOSURE > now);
    for (const p of known) push(Math.max(now, p.bookClosure! + PAY_AFTER_BOOK_CLOSURE), p.dps, true);
    // last year's payouts, a year on (a little over a year back, so a dividend announced late this year isn't missed)
    const lastYear = cash.filter((p) => now - p.announced < YEAR + 30 * DAY && !known.includes(p)).sort((a, b) => b.announced - a.announced);
    if (!cash.some((p) => now - p.announced < YEAR + 30 * DAY)) {
      none.push(r.symbol);
      continue;
    }
    if (d.cut) {
      cut.push(r.symbol);
      continue;
    }
    for (const p of lastYear) {
      const t = (p.bookClosure ?? p.announced + BOOK_AFTER_ANNOUNCED) + YEAR + PAY_AFTER_BOOK_CLOSURE;
      // the same dividend already announced for this year, or already counted (within six weeks): not twice
      if (items.some((i) => i.symbol === r.symbol && Math.abs(i.t - t) < 42 * DAY)) continue;
      if (inWindow(t)) push(t, p.dps, false);
    }
  }
  items.sort((a, b) => a.t - b.t);
  const byMonth = months.map((m) => {
    const its = items.filter((i) => i.month === m);
    return { month: m, gross: its.reduce((a, i) => a + i.gross, 0), net: its.reduce((a, i) => a + i.net, 0), known: its.filter((i) => i.known).reduce((a, i) => a + i.net, 0) };
  });
  const kept = items;
  return {
    items: kept,
    months: byMonth,
    gross: kept.reduce((a, i) => a + i.gross, 0),
    net: kept.reduce((a, i) => a + i.net, 0),
    cut,
    none,
  };
}

/**
 * Steady dividend payers you don't own, for raising the income: index members
 * with a yield between 5% and 18% (higher is usually a one-off or a falling
 * price), largest first by yield. `shariah` keeps KMI-30 members only.
 */
export function incomeIdeas<T extends { symbol: string; divYield: number | null; indexes: string[]; price: number | null }>(
  stocks: T[],
  owned: Set<string>,
  shariah: boolean,
  n = 5,
): T[] {
  return stocks
    .filter((s) => !owned.has(s.symbol) && (shariah ? s.indexes.includes('KMI30') : s.indexes.includes('KSE100') || s.indexes.includes('KMI30')))
    .filter((s) => s.divYield != null && s.divYield >= 5 && s.divYield <= 18 && (s.price ?? 0) > 0)
    .sort((a, b) => (b.divYield ?? 0) - (a.divYield ?? 0))
    .slice(0, n);
}

/**
 * Which months a company has paid cash dividends in (book closure month), over
 * the last `years` years: month index (0 = January) → how many of those years.
 */
export function payMonths(list: { dps: number; bookClosure: number | null }[], now = Date.now(), years = 3): Map<number, number> {
  const from = now - years * 365 * 864e5;
  const seen = new Map<number, Set<number>>();
  for (const p of list) {
    if (!(p.dps > 0) || p.bookClosure == null || p.bookClosure < from || p.bookClosure > now + 60 * 864e5) continue;
    const d = new Date(p.bookClosure + 5 * 3600_000);
    const m = d.getUTCMonth();
    seen.set(m, (seen.get(m) ?? new Set()).add(d.getUTCFullYear()));
  }
  return new Map([...seen].map(([m, ys]) => [m, ys.size]));
}
