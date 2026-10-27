/** Your own cap on how much of your money any one sector may take, and which sectors are over it. */
import { makePref } from '../prefs';

export interface SectorLimits {
  /** applies to every sector without its own limit, % (null = none) */
  all: number | null;
  /** per sector (short name, e.g. "Banks"), % */
  per: Record<string, number>;
}

export const sectorLimitsPref = makePref<SectorLimits>('real.sectorLimits', { all: null, per: {} });

export const isSectorLimits = (v: unknown): v is SectorLimits =>
  !!v && typeof v === 'object' && ((v as SectorLimits).all === null || typeof (v as SectorLimits).all === 'number') && typeof (v as SectorLimits).per === 'object';

export interface SectorShare {
  sector: string;
  value: number;
  /** 0–1 */
  share: number;
  symbols: string[];
  /** %, or null */
  limit: number | null;
  /** rupees above the limit (0 when within it) */
  over: number;
}

export function sectorShares(holdings: { symbol: string; sector: string; value: number }[], limits: SectorLimits): SectorShare[] {
  const m = new Map<string, { value: number; symbols: string[] }>();
  let total = 0;
  for (const h of holdings) {
    if (!(h.value > 0)) continue;
    total += h.value;
    const a = m.get(h.sector) ?? { value: 0, symbols: [] };
    a.value += h.value;
    a.symbols.push(h.symbol);
    m.set(h.sector, a);
  }
  return [...m]
    .map(([sector, a]) => {
      const limit = limits.per[sector] ?? limits.all;
      const share = total ? a.value / total : 0;
      return { sector, value: a.value, share, symbols: a.symbols, limit, over: limit != null && share * 100 > limit + 1e-9 ? a.value - (total * limit) / 100 : 0 };
    })
    .sort((a, b) => b.value - a.value);
}

export const overLimit = (rows: SectorShare[]) => rows.filter((r) => r.over > 0);

export function setLimit(l: SectorLimits, sector: string | null, pct: number | null): SectorLimits {
  const v = pct == null || !Number.isFinite(pct) || pct <= 0 ? null : Math.min(100, pct);
  if (sector == null) return { ...l, all: v };
  const per = { ...l.per };
  if (v == null) delete per[sector];
  else per[sector] = v;
  return { ...l, per };
}
