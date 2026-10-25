/**
 * Portfolio health check: the structural things worth fixing, each with what
 * would fix it. Thresholds match the rest of Sahm (Trim over 20% in one stock,
 * sector warning over 35% in red, 25% here as a softer flag).
 */
import type { Stock } from '../psx/types';
import { shortSector } from '../sectors';
import type { Row } from './useReviews';

export type Level = 'ok' | 'warn' | 'bad';
export interface HealthItem {
  key: string;
  level: Level;
  title: string;
  fix: string;
}

export const LIMITS = { stock: 0.2, sector: 0.25, tiny: 0.015, gap: 0.08 };

/** Rough sector weights of an index from its members' market value (PSX uses free float, so this is approximate). */
export function indexSectors(stocks: Stock[], index: string): Map<string, number> {
  const m = stocks.filter((s) => s.indexes?.includes(index) && (s.marketCap ?? 0) > 0);
  const total = m.reduce((a, s) => a + (s.marketCap ?? 0), 0);
  const out = new Map<string, number>();
  if (!total) return out;
  for (const s of m) out.set(s.sector, (out.get(s.sector) ?? 0) + (s.marketCap ?? 0) / total);
  return out;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;

export function healthCheck(rows: Row[], stocks: Stock[], benchmark: 'KSE100' | 'KMI30' = 'KMI30'): HealthItem[] {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total || !rows.length) return [];
  const out: HealthItem[] = [];

  // one stock too big
  for (const r of rows.filter((x) => x.value / total > LIMITS.stock).sort((a, b) => b.value - a.value)) {
    const addElsewhere = r.value / LIMITS.stock - total;
    out.push({
      key: `stock-${r.holding.symbol}`,
      level: r.value / total > 0.3 ? 'bad' : 'warn',
      title: `${r.holding.symbol} is ${pct(r.value / total)} of your money`,
      fix: `Putting about ${rs(addElsewhere)} of new money into other holdings brings it under 20% without selling.`,
    });
  }

  // one sector too big
  const sec = new Map<string, number>();
  for (const r of rows) {
    const k = r.stock?.sector ?? 'Other';
    sec.set(k, (sec.get(k) ?? 0) + r.value);
  }
  for (const [name, v] of [...sec].filter(([, v]) => v / total > LIMITS.sector).sort((a, b) => b[1] - a[1])) {
    out.push({
      key: `sector-${name}`,
      level: v / total > 0.35 ? 'bad' : 'warn',
      title: `${shortSector(name)} is ${pct(v / total)} of your money`,
      fix: `About ${rs(v / LIMITS.sector - total)} of new money in other sectors brings it to 25%. "Invest cash" already avoids adding to it.`,
    });
  }

  // positions too small to matter
  const tiny = rows.filter((r) => r.value / total < LIMITS.tiny).sort((a, b) => a.value - b.value);
  if (tiny.length) {
    const target = total * 0.03;
    const topUp = tiny.reduce((a, r) => a + Math.max(0, target - r.value), 0);
    const sum = tiny.reduce((a, r) => a + r.value, 0);
    out.push({
      key: 'tiny',
      level: tiny.length >= 3 ? 'warn' : 'ok',
      title: `${tiny.length} holding${tiny.length > 1 ? 's are' : ' is'} under 1.5% each (${tiny.map((r) => r.holding.symbol).join(', ')})`,
      fix: `Together ${rs(sum)}, ${pct(sum / total)} of your money, so they barely move your result. Either bring each to about 3% (${rs(topUp)} in all) or let them go when convenient; selling at a loss can offset tax on share gains.`,
    });
  }

  // business weakening
  const review = rows.filter((r) => r.review?.action === 'Review');
  if (review.length)
    out.push({
      key: 'review',
      level: 'bad',
      title: `${review.map((r) => r.holding.symbol).join(', ')} marked Review`,
      fix: 'The business has weakened (losses or falling earnings). Tap "Why?" on each to see what changed before deciding.',
    });

  // what the index has that you don't
  const idx = indexSectors(stocks, benchmark);
  const gaps = [...idx]
    .map(([name, w]) => ({ name, w, mine: (sec.get(name) ?? 0) / total }))
    .filter((g) => g.w - g.mine > LIMITS.gap)
    .sort((a, b) => b.w - b.mine - (a.w - a.mine))
    .slice(0, 2);
  for (const g of gaps)
    out.push({
      key: `gap-${g.name}`,
      level: 'ok',
      title: `${shortSector(g.name)}: about ${pct(g.w)} of the ${benchmark === 'KMI30' ? 'KMI-30' : 'KSE-100'}, ${pct(g.mine)} of yours`,
      fix: `Not a problem by itself, but it's a big reason your return will differ from the index. Your ETF covers some of it.`,
    });

  if (!out.some((x) => x.level !== 'ok'))
    out.unshift({ key: 'fine', level: 'ok', title: 'No big structural problems', fix: 'No stock over 20%, no sector over 25%, and nothing marked Review.' });
  const order: Record<Level, number> = { bad: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
