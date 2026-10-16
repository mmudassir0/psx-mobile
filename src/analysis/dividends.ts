/**
 * Dividends from PSX's payouts table: amounts per share, totals per fiscal
 * year, the trailing yield, and cuts or skipped dividends.
 *
 * PSX states payouts as a percentage of face value ("250%(F) (D)" = 250% of
 * face value, final, cash dividend). Face value isn't on the page, so it is
 * inferred: of the usual values (Rs 10, 5, 2, 1), the one that makes the
 * trailing payouts match PSX's own published dividend yield.
 */
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
  list: { announced: number; period: string | null; periodType: string | null; dps: number; bonusPct: number; bookClosure: number | null }[];
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
    bookClosure: p.bookClosure,
  }));
  const ttm = list.filter((p) => now - p.announced < YEAR).reduce((s, p) => s + p.dps, 0);
  const byFy = new Map<string, number>();
  for (const p of list) if (p.period) byFy.set(fyOf(p.period, opts.fiscalEndMonth), (byFy.get(fyOf(p.period, opts.fiscalEndMonth)) ?? 0) + p.dps);
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
    if (before > 0 && resultsKnown) {
      if (now0 === 0) cut = `No cash dividend for fiscal ${latest}, after ${r(before)} a share for ${prevYear}`;
      else if (now0 <= before * 0.5) cut = `Dividend cut from ${r(before)} to ${r(now0)} a share (fiscal ${prevYear} → ${latest})`;
      else if (now0 <= before * 0.8) lower = `Dividend lower: ${r(now0)} a share for fiscal ${latest}, against ${r(before)} the year before`;
    }
  }
  return { faceValue: fv, ttm, ttmYield: opts.price ? ttm / opts.price : null, years, list, cut, lower };
}
