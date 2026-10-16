/**
 * Stock filters for the Market screen. Price filters work for every stock;
 * return on equity and debt need a balance sheet, which Sahm has only for
 * KSE-100 and KMI-30 members, so those filters leave the rest out.
 */
import type { Stock } from '../psx/types';
import type { BalanceSheet } from './ratios';

export type FilterId = 'kse100' | 'kmi30' | 'div8' | 'lowpe' | 'roe15' | 'lowdebt';
export type SortId = 'cap' | 'pe' | 'div' | 'roe';

export const FILTERS: { id: FilterId; label: string; needsBalance?: boolean }[] = [
  { id: 'kse100', label: 'KSE-100' },
  { id: 'kmi30', label: 'KMI-30' },
  { id: 'div8', label: 'Dividend 8%+' },
  { id: 'lowpe', label: 'P/E under 8' },
  { id: 'roe15', label: 'ROE 15%+', needsBalance: true },
  { id: 'lowdebt', label: 'Low debt', needsBalance: true },
];
export const SORTS: { id: SortId; label: string }[] = [
  { id: 'cap', label: 'Biggest' },
  { id: 'pe', label: 'Lowest P/E' },
  { id: 'div', label: 'Highest dividend' },
  { id: 'roe', label: 'Highest ROE' },
];

/** A P/E under 1 is almost always a data problem or a one-off gain, so it's ignored. */
export const MIN_PE = 1;

/** Profit over the last four quarters (market cap ÷ P/E) ÷ equity. */
export function roeOf(s: Stock, bs: BalanceSheet | null): number | null {
  if (!bs || !(bs.equity > 0) || !s.marketCap || !s.pe || s.pe <= 0) return null;
  return s.marketCap / s.pe / bs.equity;
}

export function debtOf(bs: BalanceSheet | null): number | null {
  if (!bs || bs.isBank || bs.borrowings == null || !(bs.equity > 0)) return null;
  return bs.borrowings / bs.equity;
}

export function passes(id: FilterId, s: Stock, bs: BalanceSheet | null): boolean {
  switch (id) {
    case 'kse100':
      return s.indexes.includes('KSE100');
    case 'kmi30':
      return s.indexes.includes('KMI30');
    case 'div8':
      return (s.divYield ?? 0) >= 8;
    case 'lowpe':
      return s.pe != null && s.pe >= MIN_PE && s.pe < 8;
    case 'roe15':
      return (roeOf(s, bs) ?? 0) >= 0.15;
    case 'lowdebt': {
      const d = debtOf(bs);
      return d != null && d < 0.3;
    }
  }
}

export function screen(stocks: Stock[], filters: FilterId[], sort: SortId, bsOf: (symbol: string) => BalanceSheet | null): Stock[] {
  const out = stocks.filter((s) => filters.every((f) => passes(f, s, bsOf(s.symbol))));
  const key = (s: Stock): number => {
    if (sort === 'pe') return s.pe != null && s.pe >= MIN_PE ? -s.pe : -Infinity;
    if (sort === 'div') return s.divYield ?? -Infinity;
    if (sort === 'roe') return roeOf(s, bsOf(s.symbol)) ?? -Infinity;
    return s.marketCap ?? -Infinity;
  };
  return out.sort((a, b) => key(b) - key(a));
}

/** A short line of the numbers behind the active filters, for the stock's row. */
export function screenLine(s: Stock, bs: BalanceSheet | null): string {
  const parts: string[] = [];
  if (s.pe != null && s.pe > 0) parts.push(`P/E ${s.pe.toFixed(1)}`);
  if (s.divYield != null && s.divYield > 0) parts.push(`div ${s.divYield.toFixed(1)}%`);
  const roe = roeOf(s, bs);
  if (roe != null) parts.push(`ROE ${(roe * 100).toFixed(0)}%`);
  const d = debtOf(bs);
  if (d != null) parts.push(`debt ${(d * 100).toFixed(0)}% of equity`);
  return parts.join(' · ');
}
