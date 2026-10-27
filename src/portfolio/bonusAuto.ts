/**
 * Bonus shares added by themselves: once a bonus issue's book closure is 10
 * days past (the new shares are usually in the account by then), Sahm adds them
 * to the holding and lowers the average, but only when its own daily record shows
 * you held exactly today's shares before book closure, so shares typed in later
 * (that may already include the bonus) are never counted twice. Every change is
 * logged and can be undone.
 */

export interface BonusEntry {
  key: string;
  symbol: string;
  pct: number;
  /** book closure day */
  day: string;
  before: { shares: number; avgCost: number };
  after: { shares: number; avgCost: number };
  /** when added, epoch ms */
  at: number;
  auto: boolean;
}

export const SETTLE_DAYS = 10;
const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function bonusAfter(shares: number, avgCost: number, pct: number) {
  const n = Math.floor(shares * (1 + pct / 100));
  return { shares: n, avgCost: n > shares ? Math.round(((shares * avgCost) / n) * 100) / 100 : avgCost };
}

/** Bonuses ready to add now. */
export function dueBonuses(input: {
  holdings: { symbol: string; shares: number; avgCost: number }[];
  bonuses: Record<string, { pct: number; key: string; bookClosure: number } | null>;
  applied: string[];
  /** shares in Sahm's record at the end of a day, if it has one */
  sharesOn: (symbol: string, day: string) => number | null;
  now: number;
}): BonusEntry[] {
  const out: BonusEntry[] = [];
  for (const h of input.holdings) {
    const b = input.bonuses[h.symbol];
    if (!b) continue;
    const key = `${h.symbol}:${b.key}`;
    if (input.applied.includes(key)) continue;
    if (input.now - b.bookClosure < SETTLE_DAYS * 864e5) continue;
    const before = input.sharesOn(h.symbol, pk(b.bookClosure - 864e5));
    if (before == null || before !== h.shares) continue;
    const after = bonusAfter(h.shares, h.avgCost, b.pct);
    if (after.shares <= h.shares) continue;
    out.push({ key, symbol: h.symbol, pct: b.pct, day: pk(b.bookClosure), before: { shares: h.shares, avgCost: h.avgCost }, after, at: input.now, auto: true });
  }
  return out;
}

/** Undo is safe only while the holding is still exactly what the bonus made it. */
export const canUndo = (e: BonusEntry, h: { shares: number; avgCost: number } | undefined) => !!h && h.shares === e.after.shares && Math.abs(h.avgCost - e.after.avgCost) < 0.005;
