/**
 * Reviews a real holding: Add more, Hold, Trim or Review, with the reasons.
 *
 * Built for a long-term investor:
 *  - Fundamental breaks (losses, collapsing earnings) are what call a holding
 *    into question.
 *  - Technical breaks are warnings: they turn Hold into "Hold, watch closely",
 *    never into a sell on their own (the backtest found chart signals have only
 *    a small edge, and selling on every dip costs fees and good holdings).
 *  - Concentration and price far above fair value suggest trimming.
 *  - What you paid is shown but never used: it doesn't change what the
 *    business is worth now.
 */
import type { Candle, CompanyInfo } from '../psx/types';
import type { Analysis, SeriesSet } from '../analysis/signals';
import type { FairValue } from '../analysis/fairValue';
import type { Ratios } from '../analysis/ratios';
import type { DataChecks } from '../analysis/quality';
import type { Dividends } from '../analysis/dividends';

export type Action = 'Add more' | 'Hold' | 'Trim' | 'Review';

export interface Holding {
  symbol: string;
  shares: number;
  avgCost: number;
}

export interface ReviewInput {
  holding: Holding;
  price: number;
  /** share of the portfolio's market value, 0..1 */
  weight: number;
  sector: string | null;
  sectorWeight: number;
  /** share of liquid stocks above their 200-day average (from the daily picks), for context */
  breadth?: number | null;
  /** an ETF or fund: no company fundamentals */
  fund: boolean;
  series: SeriesSet | null;
  analysis: Analysis | null;
  company: CompanyInfo | null;
  ratios: Ratios | null;
  hasBalanceSheet: boolean;
  isBank: boolean;
  fair: FairValue | null;
  divYield: number | null;
  /** warnings about numbers that may mislead (see analysis/quality.ts) */
  checks?: DataChecks | null;
  /** dividend history from PSX's payouts table */
  dividends?: Dividends | null;
}

export interface Review {
  action: Action;
  /** Hold with a technical warning */
  watch: boolean;
  headline: string;
  good: string[];
  bad: string[];
  fundamentalBreaks: string[];
  technicalBreaks: string[];
  /** numbers to verify before acting on them */
  checks: string[];
  /** above its 200-day average (null: not enough history) */
  trendUp: boolean | null;
  /** fair value mid ÷ price − 1, when there is a fair value */
  upside: number | null;
  value: number;
  pnl: number;
  pnlPct: number;
}

export const MAX_WEIGHT = 0.2;
export const ADD_MAX_WEIGHT = 0.1;
const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const rs = (v: number) => `Rs ${v.toFixed(2)}`;

function annual(c: CompanyInfo | null, re: RegExp): (number | null)[] {
  return c?.financialsAnnual?.rows.find((r) => re.test(r.label))?.values ?? [];
}

/** Latest quarter against the same quarter a year earlier, as a change (e.g. -0.3), with the labels. */
export function quarterYoY(c: CompanyInfo | null): { change: number; now: string; then: string } | null {
  const q = c?.financialsQuarterly;
  if (!q) return null;
  const eps = q.rows.find((r) => /^eps$/i.test(r.label))?.values ?? [];
  const label = q.periods[0];
  const m = label?.match(/(Q\d)\s*(\d{4})/i);
  if (!m) return null;
  const j = q.periods.findIndex((p) => p.toUpperCase() === `${m[1].toUpperCase()} ${Number(m[2]) - 1}`);
  const now = eps[0],
    then = j >= 0 ? eps[j] : null;
  if (now == null || then == null || then <= 0) return null;
  return { change: now / then - 1, now: label, then: q.periods[j] };
}

export function reviewHolding(x: ReviewInput): Review {
  const h = x.holding;
  const value = h.shares * x.price;
  const cost = h.shares * h.avgCost;
  const good: string[] = [];
  const bad: string[] = [];
  const fundamentalBreaks: string[] = [];
  const technicalBreaks: string[] = [];

  // --- Technical
  const S = x.series;
  let above200: boolean | null = null;
  if (S && S.c.length > 200) {
    const n = S.c.length - 1;
    const e200 = S.e200[n];
    if (e200 != null) {
      above200 = S.cl[n] > e200;
      let below = 0;
      for (let i = Math.max(0, n - 14); i <= n; i++) if (S.e200[i] != null && S.cl[i] < (S.e200[i] as number)) below++;
      const gap = S.cl[n] / e200 - 1;
      if (!above200 && below >= 10) technicalBreaks.push(`Below its 200-day average (${rs(e200)}) on ${below} of the last 15 days, ${pc(-gap, 1)} under it`);
      else if (!above200) bad.push(`Just under its 200-day average (${pc(-gap, 1)})`);
      else good.push(`Above its 200-day average (long-term uptrend)`);
      // A death cross in the last 20 days
      for (let i = Math.max(1, n - 19); i <= n; i++) {
        const a = S.e50[i - 1],
          b = S.e200[i - 1],
          c = S.e50[i],
          d = S.e200[i];
        if (a != null && b != null && c != null && d != null && a >= b && c < d) {
          technicalBreaks.push('Death cross in the last 20 days: the 50-day average fell below the 200-day');
          break;
        }
      }
    }
  }
  if (x.analysis) {
    const s = x.analysis.score;
    if (s >= 6) good.push(`Technical score ${s.toFixed(1)}/10 (${x.analysis.stance.toLowerCase()})`);
    else if (s <= 4) bad.push(`Technical score ${s.toFixed(1)}/10 (${x.analysis.stance.toLowerCase()})`);
  }

  // --- Fundamental
  if (!x.fund) {
    const c = x.company;
    const profit = annual(c, /profit after/i);
    const pe = c?.pe ?? null;
    const [p0, p1] = [profit[0], profit[1]];
    const years = c?.financialsAnnual?.periods ?? [];
    // A profit figure flagged by the data checks (holding-company standalone results, or a
    // one-off-sized swing) is a reason to look, not on its own a reason to say Review.
    const shaky = !!x.checks && (x.checks.holdingCompany || x.checks.profitSwing);
    const breakOrBad = (t: string) => (shaky ? bad.push(`${t} (see the check below)`) : fundamentalBreaks.push(t));
    if ((pe != null && pe <= 0) || (p0 != null && p0 < 0)) fundamentalBreaks.push('The company is making a loss');
    else if (p0 != null && p1 != null && p1 > 0) {
      const ch = p0 / p1 - 1;
      const yoy = quarterYoY(c);
      if (ch <= -0.3) breakOrBad(`Profit fell ${pc(-ch)} in fiscal ${years[0]}`);
      else if (ch <= -0.1 && yoy && yoy.change <= -0.25) breakOrBad(`Earnings are falling: profit down ${pc(-ch)} in fiscal ${years[0]}, and ${yoy.now} EPS down ${pc(-yoy.change)} on ${yoy.then}`);
      else if (ch <= -0.1) bad.push(`Profit fell ${pc(-ch)} in fiscal ${years[0]}`);
      else if (ch >= 0.15) good.push(`Profit grew ${pc(ch)} in fiscal ${years[0]}`);
      if (yoy && yoy.change <= -0.25 && ch > -0.1) bad.push(`${yoy.now} EPS down ${pc(-yoy.change)} on ${yoy.then}`);
      if (yoy && yoy.change >= 0.15) good.push(`${yoy.now} EPS up ${pc(yoy.change)} on ${yoy.then}`);
    }
    const r = x.ratios;
    if (x.hasBalanceSheet && r?.roe != null) {
      if (r.roe >= 0.15) good.push(`Return on equity ${pc(r.roe, 1)}`);
      else if (r.roe < 0.08) bad.push(`Weak return on equity (${pc(r.roe, 1)})`);
      if (!x.isBank && r.debtToEquity != null && r.debtToEquity > 1.5) bad.push(`Heavy borrowing: debt is ${pc(r.debtToEquity)} of equity${x.checks?.debtOdd ? ' (see the check below)' : ''}`);
    }
    const dv = x.dividends;
    if (dv?.cut) fundamentalBreaks.push(dv.cut);
    else if (dv?.lower) bad.push(dv.lower);
    const yieldPct = dv?.ttmYield != null && dv.ttm > 0 ? dv.ttmYield * 100 : x.divYield;
    if (yieldPct != null && yieldPct >= 6) good.push(`Dividend yield ${yieldPct.toFixed(1)}%${dv?.ttm ? ` (Rs ${dv.ttm.toFixed(2)} a share in the last 12 months)` : ''}`);
  }

  // --- Valuation
  const f = x.fair;
  let farAbove = false;
  if (f && !x.fund) {
    if (f.label === 'Undervalued') good.push(`Below Sahm's fair value range midpoint (${rs(f.mid)}, range ${rs(f.low)}–${rs(f.high)})`);
    if (f.label === 'Overvalued') bad.push(`Above Sahm's fair value range midpoint (${rs(f.mid)}, range ${rs(f.low)}–${rs(f.high)})`);
    farAbove = x.price > f.high * 1.25;
    if (farAbove) bad.push(`Price is more than 25% above the top of the fair value range`);
  }

  // --- Size
  const heavy = x.weight > MAX_WEIGHT;
  if (heavy) bad.push(`${pc(x.weight)} of your portfolio in one stock (over ${pc(MAX_WEIGHT)})`);
  if (x.sector && x.sectorWeight > 0.35) bad.push(`${pc(x.sectorWeight)} of your portfolio is in ${x.sector}`);

  // --- Decision
  let action: Action;
  let headline: string;
  if (fundamentalBreaks.length) {
    action = 'Review';
    headline = `The business has weakened: ${fundamentalBreaks[0].charAt(0).toLowerCase() + fundamentalBreaks[0].slice(1)}. Decide whether the reason you bought still holds.`;
  } else if (heavy || (farAbove && technicalBreaks.length > 0 && x.weight >= 0.05)) {
    // Fair value alone had an unsteady record in the backtest, so it trims only a sizeable
    // holding whose chart has also broken; on its own it is a warning.
    action = 'Trim';
    headline = heavy
      ? 'Too much of your money is in this one stock; selling part would spread the risk.'
      : `Well above Sahm's fair value range (${rs(f!.low)}–${rs(f!.high)}) and the chart has broken: taking some off is reasonable.`;
  } else if (!x.fund && f?.label === 'Undervalued' && above200 === true && technicalBreaks.length === 0 && x.weight < ADD_MAX_WEIGHT) {
    action = 'Add more';
    headline = 'Priced below fair value, business fine, trend up, and a small part of your portfolio.';
  } else {
    action = 'Hold';
    headline = technicalBreaks.length
      ? x.breadth != null && x.breadth < 0.5
        ? 'Nothing broken in the business. The chart has weakened, as it has for most of the market: hold and watch.'
        : 'Nothing broken in the business, but the chart has weakened: hold and watch closely.'
      : 'Nothing important has changed.';
  }
  return {
    action,
    watch: action === 'Hold' && technicalBreaks.length > 0,
    headline,
    good,
    bad,
    fundamentalBreaks,
    technicalBreaks,
    checks: x.checks?.notes ?? [],
    trendUp: above200,
    upside: f?.upside ?? null,
    value,
    pnl: value - cost,
    pnlPct: cost > 0 ? value / cost - 1 : 0,
  };
}

/**
 * Text pasted or read from screenshots can carry characters that look like nothing or like a space or
 * digit but aren't: zero-width spaces, direction marks, no-break and thin spaces, full-width or
 * Arabic-Indic digits. Turned into plain ones before reading.
 */
export function cleanHoldingsText(text: string): string {
  let t = text;
  try {
    t = t.normalize('NFKC');
  } catch {
    // no Unicode tables: the replacements below still cover the usual cases
  }
  return t
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2028\u2029\u0085]/g, '\n')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\uFF10-\uFF19]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\u066B\uFF0E]/g, '.')
    .replace(/[\u066C\uFF0C]/g, ',');
}

/** "LUCK 200 419.11" per line (commas or tabs also fine); returns holdings and lines it couldn't read. */
export function parseHoldings(text: string): { holdings: Holding[]; bad: string[] } {
  const holdings: Holding[] = [];
  const bad: string[] = [];
  for (const raw of cleanHoldingsText(text).split(/\r?\n/)) {
    // a numbered list ("1. LUCK 200 419.11", "- LUCK …") is fine too
    const line = raw.trim().replace(/^(?:\d+[.)]\s+|[-*•]\s+)/, '');
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9.-]*)[\s,;\t]+([\d,]+(?:\.\d+)?)[\s,;\t]+([\d,]+(?:\.\d+)?)$/);
    if (!m) {
      bad.push(line);
      continue;
    }
    const shares = Number(m[2].replace(/,/g, ''));
    const avgCost = Number(m[3].replace(/,/g, ''));
    if (!(shares > 0) || !(avgCost > 0)) bad.push(line);
    else holdings.push({ symbol: m[1].toUpperCase(), shares, avgCost });
  }
  return { holdings, bad };
}
