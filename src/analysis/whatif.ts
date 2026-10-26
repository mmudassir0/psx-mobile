/**
 * "If I had put Rs X into this stock (or index) back then": real past prices,
 * once or every month, with the cash dividends it would have paid.
 *
 * Prices are adjusted for bonus issues and splits (PSX's own adjustment), so
 * share counts are in today's shares. A dividend announced before a later
 * bonus was paid on fewer shares, so it is divided by the bonuses since.
 * Dividends are kept as cash (not reinvested), after the tax withheld.
 * The KSE-100 and KMI-30 already include dividends.
 */
import type { Candle } from '../psx/types';

export interface WhatIfDividend {
  dps: number;
  bonusPct: number;
  /** the day the payout's register closed; null when PSX doesn't list it */
  bookClosure: number | null;
}

export interface WhatIfInput {
  candles: Candle[];
  dividends?: WhatIfDividend[];
  /** epoch ms of the first buy (the first session on or after it) */
  start: number;
  /** Rs on the first day */
  amount: number;
  /** Rs on the first session of each later month (0 for a single buy) */
  monthly: number;
  /** tax withheld on cash dividends, e.g. 0.15 */
  taxRate: number;
}

export interface WhatIfResult {
  firstDay: number;
  lastDay: number;
  invested: number;
  shares: number;
  /** the shares' value today, without the dividends */
  holding: number;
  dividendsGross: number;
  dividendsNet: number;
  /** holding + dividends after tax */
  value: number;
  gain: number;
  /** gain ÷ invested */
  totalReturn: number;
  /** a yearly rate that turns the money in into today's value (money-weighted) */
  yearly: number | null;
  /** worst fall of the value below the money put in, as a share of it (≤ 0), and when */
  worst: { pct: number; t: number } | null;
  /** about one point a week, for a chart */
  series: { t: number; value: number; invested: number }[];
  buys: number;
}

const DAY = 864e5;
const pkMonth = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 7);

/** Each later bonus issue multiplies today's share count; this is that multiple for a day. */
function bonusesAfter(divs: WhatIfDividend[], t: number): number {
  return divs.filter((d) => d.bonusPct > 0 && d.bookClosure != null && d.bookClosure > t).reduce((f, d) => f * (1 + d.bonusPct / 100), 1);
}

/** The yearly rate r where the money in, grown at r, equals the value today (bisection; null if it can't be found). */
export function moneyWeightedRate(flows: { t: number; amount: number }[], value: number, end: number): number | null {
  if (!flows.length || !(value > 0)) return null;
  const fv = (r: number) => flows.reduce((a, f) => a + f.amount * Math.pow(1 + r, (end - f.t) / (365.25 * DAY)), 0) - value;
  let lo = -0.99;
  let hi = 10;
  if (fv(lo) > 0 || fv(hi) < 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function whatIf(x: WhatIfInput): WhatIfResult | null {
  const c = x.candles.filter((b) => b.c > 0).sort((a, b) => a.t - b.t);
  const i0 = c.findIndex((b) => b.t >= x.start - DAY / 2);
  if (i0 < 0 || i0 >= c.length - 1 || !(x.amount > 0 || x.monthly > 0)) return null;
  const divs = (x.dividends ?? []).filter((d) => d.bookClosure != null);
  let shares = 0;
  let invested = 0;
  let divGross = 0;
  let buys = 0;
  const flows: { t: number; amount: number }[] = [];
  const series: WhatIfResult['series'] = [];
  let worst: WhatIfResult['worst'] = null;
  let month = '';
  let lastSample = 0;
  for (let i = i0; i < c.length; i++) {
    const b = c[i];
    // dividends whose register closed since the previous session go to the shares held before today
    if (i > i0 && shares > 0) {
      const prev = c[i - 1].t;
      for (const d of divs) if (d.dps > 0 && d.bookClosure! > prev && d.bookClosure! <= b.t) divGross += (shares * d.dps) / bonusesAfter(divs, d.bookClosure!);
    }
    const m = pkMonth(b.t);
    const amt = i === i0 ? x.amount : m !== month && x.monthly > 0 ? x.monthly : 0;
    if (i === i0 || m !== month) month = m;
    if (amt > 0) {
      shares += amt / b.c;
      invested += amt;
      buys++;
      flows.push({ t: b.t, amount: amt });
    }
    const value = shares * b.c + divGross * (1 - x.taxRate);
    if (invested > 0) {
      const dd = value / invested - 1;
      if (dd < 0 && (!worst || dd < worst.pct)) worst = { pct: dd, t: b.t };
    }
    if (b.t - lastSample >= 6 * DAY || i === c.length - 1 || i === i0) {
      series.push({ t: b.t, value, invested });
      lastSample = b.t;
    }
  }
  const last = c[c.length - 1];
  const holding = shares * last.c;
  const dividendsNet = divGross * (1 - x.taxRate);
  const value = holding + dividendsNet;
  const years = (last.t - c[i0].t) / (365.25 * DAY);
  return {
    firstDay: c[i0].t,
    lastDay: last.t,
    invested,
    shares,
    holding,
    dividendsGross: divGross,
    dividendsNet,
    value,
    gain: value - invested,
    totalReturn: invested > 0 ? value / invested - 1 : 0,
    yearly: years >= 1 ? moneyWeightedRate(flows, value, last.t) : null,
    worst,
    series,
    buys,
  };
}
