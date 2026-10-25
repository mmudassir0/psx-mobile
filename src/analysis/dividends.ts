/**
 * Dividends from PSX's payouts table: amounts per share, totals per fiscal
 * year, the trailing yield, and cuts or skipped dividends.
 *
 * PSX states payouts as a percentage of face value ("250%(F) (D)" = 250% of
 * face value, final, cash dividend). Face value isn't on the page, so it is
 * inferred: of the usual values (Rs 10, 5, 2, 1), the one that makes the
 * trailing payouts match PSX's own published dividend yield.
 */
import { PSX_HOLIDAYS } from './events';

export interface PayoutItem {
  pct: number;
  /** F final, i interim, etc., as PSX writes it */
  tag: string;
  /** D cash dividend, B bonus shares, R right shares */
  type: 'D' | 'B' | 'R';
}

export interface Payout {
  /** announcement, epoch ms */
  announced: number;
  /** period end of the results it came with, YYYY-MM-DD */
  period: string | null;
  /** YR, HYR, IQ, IIIQ … */
  periodType: string | null;
  items: PayoutItem[];
  /** first day of book closure, epoch ms */
  bookClosure: number | null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const dmy = (s: string): number | null => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], 7) : null;
};

/** Parses POST /company/payouts. */
export function parsePayouts(html: string): Payout[] {
  const out: Payout[] = [];
  const body = html.split(/<tbody[^>]*>/i)[1] ?? '';
  for (const row of body.split(/<\/tr>/i)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => strip(m[1]));
    if (cells.length < 4) continue;
    const a = cells[0].match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    const mi = a ? MONTHS.indexOf(a[1].toLowerCase()) : -1;
    if (!a || mi < 0) continue;
    const pm = cells[1].match(/(\d{2})\/(\d{2})\/(\d{4})\s*\(([A-Z]+)\)/i);
    const items: PayoutItem[] = [];
    // "250%(F) (D)", "10%(F) (B)" or just "10%(B)"
    for (const m of cells[2].matchAll(/(\d+(?:\.\d+)?)\s*%\s*(?:\(([^)]*)\)\s*)?\(([DBR])\)/gi)) items.push({ pct: Number(m[1]), tag: m[2] ?? '', type: m[3].toUpperCase() as PayoutItem['type'] });
    out.push({
      announced: Date.UTC(+a[3], mi, +a[2], 7),
      period: pm ? `${pm[3]}-${pm[2]}-${pm[1]}` : null,
      periodType: pm ? pm[4].toUpperCase() : null,
      items,
      bookClosure: dmy(cells[3]),
    });
  }
  return out.sort((x, y) => y.announced - x.announced);
}

const cashPct = (p: Payout) => p.items.filter((i) => i.type === 'D').reduce((s, i) => s + i.pct, 0);
const YEAR = 365.25 * 864e5;

/** Face value that best matches PSX's dividend yield; Rs 10 when there is nothing to compare. */
export function inferFaceValue(payouts: Payout[], price: number | null, divYield: number | null, now = Date.now()): number {
  const ttmPct = payouts.filter((p) => now - p.announced < YEAR).reduce((s, p) => s + cashPct(p), 0);
  if (!price || !divYield || divYield <= 0 || ttmPct <= 0) return 10;
  const target = (divYield / 100) * price; // Rs per share a year
  return [10, 5, 2, 1].reduce((best, f) => (Math.abs((ttmPct / 100) * f - target) < Math.abs((ttmPct / 100) * best - target) ? f : best), 10);
}

export interface Dividends {
  faceValue: number;
  /** cash dividends announced in the last 12 months, Rs per share */
  ttm: number;
  ttmYield: number | null;
  /** cash dividend per share by fiscal year, newest first */
  years: { fy: string; dps: number }[];
  /** announcements, newest first, with Rs per share */
  list: { announced: number; period: string | null; periodType: string | null; dps: number; bonusPct: number; rightsPct?: number; bookClosure: number | null }[];
  /** a cut of 50% or more, or no dividend for a year after paying one */
  cut: string | null;
  /** a smaller cut (20–50%) */
  lower: string | null;
}

/** Fiscal year label of a period end, given the month (0–11) the fiscal year ends in. */
const fyOf = (period: string, endMonth: number) => {
  const [y, m] = period.split('-').map(Number);
  return String(m - 1 <= endMonth ? y : y + 1);
};

export function dividends(
  payouts: Payout[],
  opts: { price: number | null; divYield: number | null; fiscalEndMonth: number; latestFiscalYear?: string | null; now?: number },
): Dividends {
  const now = opts.now ?? Date.now();
  const fv = inferFaceValue(payouts, opts.price, opts.divYield, now);
  const list = payouts.map((p) => ({
    announced: p.announced,
    period: p.period,
    periodType: p.periodType,
    dps: (cashPct(p) / 100) * fv,
    bonusPct: p.items.filter((i) => i.type === 'B').reduce((s, i) => s + i.pct, 0),
    rightsPct: p.items.filter((i) => i.type === 'R').reduce((s, i) => s + i.pct, 0),
    bookClosure: p.bookClosure,
  }));
  const ttm = list.filter((p) => now - p.announced < YEAR).reduce((s, p) => s + p.dps, 0);
  const byFy = new Map<string, number>();
  const bonusFy = new Map<string, number>();
  for (const p of list) {
    if (!p.period) continue;
    const fy = fyOf(p.period, opts.fiscalEndMonth);
    byFy.set(fy, (byFy.get(fy) ?? 0) + p.dps);
    if (p.bonusPct > 0) bonusFy.set(fy, (bonusFy.get(fy) ?? 0) + p.bonusPct);
  }
  const years = [...byFy].map(([fy, dps]) => ({ fy, dps })).sort((a, b) => (a.fy < b.fy ? 1 : -1));
  let cut: string | null = null;
  let lower: string | null = null;
  const r = (v: number) => `Rs ${v.toFixed(2)}`;
  // Compare the latest complete fiscal year with the one before.
  const latest = opts.latestFiscalYear ?? null;
  const prevYear = latest ? String(Number(latest) - 1) : null;
  if (latest && prevYear) {
    const now0 = byFy.get(latest) ?? 0;
    const before = byFy.get(prevYear) ?? 0;
    // Only judge once the latest year's final results (YR) are out, so interims aren't mistaken for a cut.
    const finalOut = list.some((p) => p.periodType === 'YR' && p.period && fyOf(p.period, opts.fiscalEndMonth) === latest);
    const resultsKnown = finalOut || (list.length > 0 && list.every((p) => !p.period || fyOf(p.period, opts.fiscalEndMonth) !== latest));
    const bonus = bonusFy.get(latest) ?? 0;
    if (before > 0 && resultsKnown) {
      // Bonus shares are a payout too: paying in shares instead of cash is worth noting, not a cut.
      if (now0 === 0 && bonus > 0) lower = `Paid ${bonus}% bonus shares instead of a cash dividend for fiscal ${latest} (cash was ${r(before)} a share for ${prevYear})`;
      else if (now0 === 0) cut = `No cash dividend for fiscal ${latest}, after ${r(before)} a share for ${prevYear}`;
      else if (now0 <= before * 0.5 && bonus > 0) lower = `Cash dividend down from ${r(before)} to ${r(now0)} a share, plus ${bonus}% bonus shares (fiscal ${prevYear} → ${latest})`;
      else if (now0 <= before * 0.5) cut = `Dividend cut from ${r(before)} to ${r(now0)} a share (fiscal ${prevYear} → ${latest})`;
      else if (now0 <= before * 0.8) lower = `Dividend lower: ${r(now0)} a share for fiscal ${latest}, against ${r(before)} the year before`;
    }
  }
  return { faceValue: fv, ttm, ttmYield: opts.price ? ttm / opts.price : null, years, list, cut, lower };
}

// ---------------------------------------------------------------- tax ----

export type TaxStatus = 'filer' | 'non-filer';
export type PayerKind = 'stock' | 'power' | 'fund';

/**
 * Tax withheld on cash dividends (Income Tax Ordinance s.150, rates for 2026-27):
 * companies 15% for filers (on the Active Taxpayers List) and 30% for
 * non-filers; power producers 7.5% / 15%; the equity part of a mutual fund or
 * ETF 15% / 30% (its debt part is taxed more; PSX's ETFs hold shares).
 */
export function dividendTaxRate(status: TaxStatus, kind: PayerKind = 'stock'): number {
  const filer = status === 'filer';
  if (kind === 'power') return filer ? 0.075 : 0.15;
  return filer ? 0.15 : 0.3;
}

/** Which tax rate applies, from the PSX sector name. */
export function payerKind(sector: string | null | undefined): PayerKind {
  const s = sector ?? '';
  if (/power generation/i.test(s)) return 'power';
  if (/etf|exchange traded|mutual fund/i.test(s)) return 'fund';
  return 'stock';
}

// ------------------------------------------------------- upcoming payout ----

const DAY_MS = 864e5;
const HOLIDAY_SET = new Set(PSX_HOLIDAYS.map(([d]) => d));

/**
 * The last day to buy and still get a payout: PSX settles trades the next
 * working day (T+1), and the register closes at the end of the day before book
 * closure starts, so a buy must be made two working days before it. Weekends
 * and the PSX holidays Sahm knows (events.ts) are skipped; the broker's ex-date wins.
 */
const working = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !HOLIDAY_SET.has(d.toISOString().slice(0, 10));
};
export function lastBuyDay(bookClosure: number): number {
  let t = bookClosure;
  let left = 2;
  while (left > 0) {
    t -= DAY_MS;
    if (working(t)) left--;
  }
  return t;
}

/** The ex-date (first day without the payout): one working day before book closure, at the start of that day in Pakistan. */
export function exDate(bookClosure: number): number {
  let t = bookClosure;
  do t -= DAY_MS;
  while (!working(t));
  const day = new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
  return Date.parse(day + 'T00:00:00+05:00');
}

/** Cash dividends as ex-dates and Rs per share, for scoring trades held over them. */
export function cashDividends(d: Dividends | null): { exT: number; dps: number }[] {
  return (d?.list ?? []).filter((p) => p.dps > 0 && p.bookClosure != null).map((p) => ({ exT: exDate(p.bookClosure!), dps: p.dps }));
}

export interface UpcomingPayout {
  bookClosure: number;
  lastBuyDay: number;
  /** cash Rs per share before tax */
  dps: number;
  bonusPct: number;
  announced: number;
}

/** The next payout whose book closure hasn't started yet. */
export function upcomingPayout(d: Dividends | null, now = Date.now()): UpcomingPayout | null {
  if (!d) return null;
  const next = d.list.filter((p) => p.bookClosure != null && p.bookClosure > now && (p.dps > 0 || p.bonusPct > 0)).sort((a, b) => a.bookClosure! - b.bookClosure!)[0];
  if (!next) return null;
  return { bookClosure: next.bookClosure!, lastBuyDay: lastBuyDay(next.bookClosure!), dps: next.dps, bonusPct: next.bonusPct, announced: next.announced };
}

/** A bonus issue whose book closure has passed in the last 60 days (the shares should be in your account by now). */
export function recentBonus(d: Dividends | null, now = Date.now()): { pct: number; key: string; bookClosure: number } | null {
  if (!d) return null;
  const b = d.list.find((p) => p.bonusPct > 0 && p.bookClosure != null && p.bookClosure < now && now - p.bookClosure < 60 * DAY_MS);
  return b ? { pct: b.bonusPct, key: String(b.announced), bookClosure: b.bookClosure! } : null;
}

export interface RightsIssue {
  /** new shares offered per 100 held */
  pct: number;
  bookClosure: number;
  lastBuyDay: number;
  announced: number;
  /** before book closure you can still buy to qualify; after it, subscribe or sell the rights */
  phase: 'before' | 'after';
}

/** A rights issue whose book closure is ahead, or passed in the last 45 days (subscription is usually still open). */
export function currentRights(d: Dividends | null, now = Date.now()): RightsIssue | null {
  if (!d) return null;
  const r = d.list
    .filter((p) => (p.rightsPct ?? 0) > 0 && p.bookClosure != null && p.bookClosure > now - 45 * DAY_MS)
    .sort((a, b) => a.bookClosure! - b.bookClosure!)[0];
  if (!r) return null;
  return { pct: r.rightsPct!, bookClosure: r.bookClosure!, lastBuyDay: lastBuyDay(r.bookClosure!), announced: r.announced, phase: r.bookClosure! > now ? 'before' : 'after' };
}

/**
 * The maths of a rights issue at an offer price: the price the shares should
 * settle at once the new ones exist (theoretical ex-rights price) and what one
 * right is worth (that price minus the offer price).
 */
export function rightsMaths(shares: number, pct: number, price: number, offer: number) {
  const entitled = Math.floor((shares * pct) / 100);
  const terp = (price * 100 + offer * pct) / (100 + pct);
  const perRight = Math.max(0, terp - offer);
  return { entitled, cost: entitled * offer, terp, perRight, valueOfRights: entitled * perRight };
}
