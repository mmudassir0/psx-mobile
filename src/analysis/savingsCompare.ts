/**
 * Was the stock market worth it? Your return over the days Sahm has tracked, next to what the same
 * money would have earned in 12-month T-bills, what inflation took away, and what the dollar did.
 * No phone APIs, for the tests.
 */
import type { MacroFeed } from './macro';

export interface SavingsCompare {
  from: string;
  to: string;
  days: number;
  mine: number;
  tbill: number;
  inflation: number;
  /** your return after inflation */
  real: number;
  /** null when the dollar's history doesn't reach back to the start */
  usd: number | null;
  /** T-bill yields before the first saved one were taken as that first one */
  tbillAssumedFrom: string | null;
  /** months past the latest inflation figure were taken at the latest month's rate */
  inflationAssumedFrom: string | null;
}

const dayMs = 864e5;
const t = (d: string) => Date.parse(d + 'T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function compareSavings(from: string, to: string, mine: number, macro: Pick<MacroFeed, 'history' | 'inflation' | 'now'>): SavingsCompare | null {
  const days = Math.round((t(to) - t(from)) / dayMs);
  if (!(days >= 1)) return null;
  // T-bills: each day earns that day's 12-month yield, simple interest as a 12-month bill pays it
  const hist = macro.history.filter((r) => r[3] != null).sort((a, b) => a[0].localeCompare(b[0]));
  const fallback = hist[0]?.[3] ?? macro.now.tbills.m12;
  if (fallback == null) return null;
  let k = 0;
  let y = fallback;
  let g = 1;
  for (let d = t(from) + dayMs; d <= t(to); d += dayMs) {
    const day = iso(d);
    while (k < hist.length && hist[k][0] <= day) y = hist[k++][3]!;
    g += y / 100 / 365;
  }
  const tbill = g - 1;
  // inflation: each month's month-on-month rise, spread evenly over its days
  const inf = [...(macro.inflation ?? [])].sort((a, b) => a[0].localeCompare(b[0])).filter((x) => x[2] != null);
  let inflation = 0;
  let infAssumed: string | null = null;
  if (inf.length) {
    const byMonth = new Map(inf.map((x) => [x[0], x[2]!]));
    const last = inf[inf.length - 1];
    let p = 1;
    for (let d = t(from) + dayMs; d <= t(to); d += dayMs) {
      const day = iso(d);
      const m = day.slice(0, 7);
      let mom = byMonth.get(m);
      if (mom == null) {
        mom = m > last[0] ? last[2]! : inf[0][2]!;
        if (m > last[0] && !infAssumed) infAssumed = m;
      }
      const dim = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
      p *= Math.pow(1 + mom / 100, 1 / dim);
    }
    inflation = p - 1;
  }
  const usdRows = macro.history.filter((r) => r[2] != null);
  const u0 = usdRows.find((r) => r[0] <= from) ? [...usdRows].reverse().find((r) => r[0] <= from)![2]! : null;
  const u1 = [...usdRows].reverse().find((r) => r[0] <= to)?.[2] ?? null;
  return {
    from,
    to,
    days,
    mine,
    tbill,
    inflation,
    real: (1 + mine) / (1 + inflation) - 1,
    usd: u0 && u1 ? u1 / u0 - 1 : null,
    tbillAssumedFrom: hist.length && hist[0][0] > from ? hist[0][0] : hist.length ? null : from,
    inflationAssumedFrom: infAssumed,
  };
}
