/**
 * "Where should this month's money go?" Splits new money across holdings you
 * already own, using the same rules as the holding review:
 *  - never into a holding marked Review or Trim, or one whose chart has broken
 *  - never so much that a holding passes 10% of the portfolio, or a sector 35%
 *  - more to holdings below fair value and in an uptrend, and to small ones
 * Buying elsewhere also shrinks an oversized holding's share without selling it
 * (no tax, no fees), so the plan says how much new money would bring it back
 * under the 20% limit.
 */
import type { Review } from './review';
import { ADD_MAX_WEIGHT, MAX_WEIGHT } from './review';

export const SECTOR_MAX = 0.35;

export interface PlanRow {
  symbol: string;
  price: number;
  value: number;
  sector: string;
  review: Review | null;
  fund?: boolean;
}

export interface PlanLine {
  symbol: string;
  shares: number;
  amount: number;
  price: number;
  /** weight after buying */
  weightAfter: number;
  why: string;
}

export interface Plan {
  lines: PlanLine[];
  /** money not placed (rounding to whole shares, or nowhere left within limits) */
  left: number;
  /** holdings not given money, with the reason */
  skipped: { symbol: string; why: string }[];
  /** holdings over the 20% limit and the new money (elsewhere) that brings each under it */
  dilute: { symbol: string; weight: number; needed: number }[];
  /** a caution about today's market, when there is one */
  note: string | null;
}

export const FAR_ABOVE = -0.5;

const pc = (v: number) => `${(v * 100).toFixed(0)}%`;

function score(r: PlanRow, weight: number): { s: number; why: string[] } {
  const why: string[] = [];
  let s = 1;
  const rv = r.review!;
  if (rv.action === 'Add more') {
    s += 1;
    why.push('marked Add more');
  }
  if (r.fund) why.push('a fund of many stocks, so it spreads risk');
  if (rv.upside != null) {
    const u = Math.max(-0.3, Math.min(0.5, rv.upside));
    s += u * 2;
    if (rv.upside > 0.1) why.push(`${pc(rv.upside)} below fair value`);
    else if (rv.upside < -0.1) why.push(`${pc(-rv.upside)} above fair value, so less`);
  }
  if (rv.trendUp) {
    s += 0.5;
    why.push('above its 200-day average');
  }
  // small holdings get more, to spread the money
  const gap = Math.max(0, ADD_MAX_WEIGHT - weight) / ADD_MAX_WEIGHT;
  s += gap;
  if (weight < 0.04) why.push(`only ${pc(weight)} of the portfolio`);
  return { s: Math.max(0.1, s), why };
}

export function planMoney(rows: PlanRow[], amount: number, opts: { breadth?: number | null } = {}): Plan {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const after = total + amount;
  const sector = new Map<string, number>();
  for (const r of rows) sector.set(r.sector, (sector.get(r.sector) ?? 0) + r.value);

  const skipped: Plan['skipped'] = [];
  const pool: { r: PlanRow; s: number; why: string[]; cap: number }[] = [];
  for (const r of rows) {
    const rv = r.review;
    const w = total ? r.value / total : 0;
    if (!rv) skipped.push({ symbol: r.symbol, why: 'still checking' });
    else if (rv.action === 'Review') skipped.push({ symbol: r.symbol, why: 'the business has weakened (Review)' });
    else if (rv.action === 'Trim') skipped.push({ symbol: r.symbol, why: 'already too big or too expensive (Trim)' });
    else if (rv.watch) skipped.push({ symbol: r.symbol, why: 'the chart has broken; wait for it to recover' });
    else if (w >= ADD_MAX_WEIGHT) skipped.push({ symbol: r.symbol, why: `already ${pc(w)} of the portfolio` });
    else if (rv.upside != null && rv.upside < FAR_ABOVE) skipped.push({ symbol: r.symbol, why: `${pc(-rv.upside)} above Sahm's fair value` })
    else if ((sector.get(r.sector) ?? 0) / (total || 1) >= SECTOR_MAX) skipped.push({ symbol: r.symbol, why: `its sector is already over ${pc(SECTOR_MAX)}` });
    else {
      const { s, why } = score(r, w);
      // room under the 10% limit, measured on the portfolio after the new money
      const cap = Math.max(0, ADD_MAX_WEIGHT * after - r.value);
      pool.push({ r, s, why, cap });
    }
  }

  // Share the money by score, respecting each cap and each sector's room; repeat with what's left.
  const give = new Map<string, number>();
  const sectorRoom = new Map([...sector].map(([k, v]) => [k, Math.max(0, SECTOR_MAX * after - v)]));
  let left = amount;
  for (let round = 0; round < 6 && left > 1; round++) {
    const open = pool.filter((p) => (give.get(p.r.symbol) ?? 0) < p.cap - 1 && (sectorRoom.get(p.r.sector) ?? 0) > 1);
    if (!open.length) break;
    const sum = open.reduce((a, p) => a + p.s, 0);
    let placed = 0;
    for (const p of open) {
      const want = (left * p.s) / sum;
      const room = Math.min(p.cap - (give.get(p.r.symbol) ?? 0), sectorRoom.get(p.r.sector) ?? 0);
      const g = Math.min(want, room);
      give.set(p.r.symbol, (give.get(p.r.symbol) ?? 0) + g);
      sectorRoom.set(p.r.sector, (sectorRoom.get(p.r.sector) ?? 0) - g);
      placed += g;
    }
    left -= placed;
    if (placed < 1) break;
  }

  // Whole shares only; then spend what rounding left on the best-scored holdings that still have room.
  const lines: PlanLine[] = [];
  let cash = amount;
  const shares = new Map<string, number>();
  for (const p of pool) {
    const n = Math.floor((give.get(p.r.symbol) ?? 0) / p.r.price);
    if (n > 0) shares.set(p.r.symbol, n);
    cash -= n * p.r.price;
  }
  // Sector room left after the whole shares actually bought (rounding down frees some).
  const room = new Map([...sector].map(([k, v]) => [k, Math.max(0, SECTOR_MAX * after - v)]));
  for (const p of pool) room.set(p.r.sector, (room.get(p.r.sector) ?? 0) - (shares.get(p.r.symbol) ?? 0) * p.r.price);
  // Leftover cash buys more whole shares, within each holding's cap and its sector's room;
  // this can also give one share to a holding whose part was under one share's price.
  for (const p of [...pool].sort((a, b) => b.s - a.s)) {
    const n0 = shares.get(p.r.symbol) ?? 0;
    const extra = Math.floor(Math.max(0, Math.min(cash, p.cap - n0 * p.r.price, room.get(p.r.sector) ?? 0)) / p.r.price);
    if (extra > 0) {
      shares.set(p.r.symbol, n0 + extra);
      cash -= extra * p.r.price;
      room.set(p.r.sector, (room.get(p.r.sector) ?? 0) - extra * p.r.price);
    }
  }
  for (const p of pool.sort((a, b) => b.s - a.s)) {
    const n = shares.get(p.r.symbol) ?? 0;
    if (!n) continue;
    const amt = n * p.r.price;
    lines.push({
      symbol: p.r.symbol,
      shares: n,
      amount: amt,
      price: p.r.price,
      weightAfter: (p.r.value + amt) / after,
      why: p.why.length ? p.why.join(', ') : 'nothing against it',
    });
  }
  for (const p of pool) if (!shares.get(p.r.symbol)) skipped.push({ symbol: p.r.symbol, why: give.get(p.r.symbol) ? 'its share came to less than one share' : 'no room left under the limits' });

  const dilute = rows
    .filter((r) => total && r.value / total > MAX_WEIGHT)
    .map((r) => ({ symbol: r.symbol, weight: r.value / total, needed: Math.max(0, r.value / MAX_WEIGHT - total) }));

  const broken = rows.filter((r) => r.review?.watch).length;
  let note: string | null = null;
  if (!lines.length)
    note = 'None of your holdings passes the rules today. Keeping the money as cash until a chart recovers, or using a broad ETF, are the usual choices.';
  else if (opts.breadth != null && opts.breadth < 0.5 && broken >= rows.length / 2)
    note = `Only ${pc(opts.breadth)} of PSX stocks are in uptrends and ${broken} of your ${rows.length} holdings have weak charts, so this uses only the few that don't. Buying part now and the rest over the next weeks lowers the risk of buying just before a further fall.`;
  if (lines.length && cash > amount * 0.2)
    note = (note ? note + ' ' : '') + `Rs ${Math.round(cash).toLocaleString('en-US')} has no room under the 10% limit in your current holdings; a new stock or a broad ETF would take it.`;
  return { lines, left: cash, skipped, dilute, note };
}
