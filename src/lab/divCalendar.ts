/** Ten years of dividends, market-wide: which stocks usually go ex-dividend in each month, how reliably, and what each payment was worth. Pure. */
import type { Lab } from './data';

export interface MonthPayer {
  symbol: string;
  sector: string;
  shariah: boolean;
  /** years it paid in this month, of the years covered */
  years: number;
  of: number;
  /** typical payment in this month, as a share of the price the day before */
  payYield: number;
  /** the last year it paid in this month */
  last: string;
}

export function divCalendar(lab: Lab, fromYear: number): MonthPayer[][] {
  const lastFull = Number(lab.days[lab.days.length - 1].slice(0, 4)) - 1;
  const out: MonthPayer[][] = Array.from({ length: 12 }, () => []);
  for (const s of lab.stocks) {
    if (!s.divs.length) continue;
    const firstDay = lab.days[s.close.findIndex((c) => c > 0)] ?? lab.days[0];
    const from = Math.max(fromYear, Number(firstDay.slice(0, 4)) + (firstDay.slice(5) > '01-31' ? 1 : 0));
    const of = lastFull - from + 1;
    if (of < 3) continue;
    const byMonth = new Map<number, { years: Set<number>; ys: number[]; last: string }>();
    for (const d of s.divs) {
      const day = lab.days[d.i];
      const y = Number(day.slice(0, 4));
      const prev = s.close[d.i - 1];
      if (!(prev > 0)) continue;
      const m = Number(day.slice(5, 7)) - 1;
      const e = byMonth.get(m) ?? { years: new Set<number>(), ys: [], last: '' };
      if (y >= from && y <= lastFull) e.years.add(y);
      e.ys.push(d.dps / prev);
      if (day > e.last) e.last = day;
      byMonth.set(m, e);
    }
    for (const [m, e] of byMonth) {
      if (e.years.size < 2) continue;
      const ys = [...e.ys].sort((a, b) => a - b);
      out[m].push({ symbol: s.symbol, sector: s.sector, shariah: s.shariah, years: e.years.size, of, payYield: ys[Math.floor(ys.length / 2)], last: e.last });
    }
  }
  for (const l of out) l.sort((a, b) => b.years / b.of - a.years / a.of || b.payYield - a.payYield);
  return out;
}
