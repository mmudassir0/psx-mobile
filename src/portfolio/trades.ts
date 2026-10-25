/**
 * Every buy and sell you record in Sahm ("Bought or sold"), kept on the phone,
 * for realised gains in the tax year (July to June) and their tax.
 */
import { makePref } from '../prefs';

export interface TradeRecord {
  /** YYYY-MM-DD, Pakistan */
  day: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  /** average cost before the trade */
  avgCost: number;
  /** profit (+) or loss (−) on a sale */
  realised: number | null;
}

export const tradesPref = makePref<TradeRecord[]>('real.trades', []);

export async function logTrade(t: TradeRecord) {
  const cur = await tradesPref.get();
  await tradesPref.set([...cur, t].slice(-2000));
}

/** Pakistan's tax year runs 1 July to 30 June; named by the year it ends in (TY2027 = July 2026 – June 2027). */
export function taxYearOf(day: string): number {
  const [y, m] = day.split('-').map(Number);
  return m >= 7 ? y + 1 : y;
}

export interface TaxYear {
  year: number;
  gains: number;
  losses: number;
  net: number;
  sales: number;
}

export function taxYearSummary(trades: TradeRecord[], year: number): TaxYear {
  const sells = trades.filter((t) => t.side === 'sell' && t.realised != null && taxYearOf(t.day) === year);
  const gains = sells.filter((t) => t.realised! > 0).reduce((a, t) => a + t.realised!, 0);
  const losses = sells.filter((t) => t.realised! < 0).reduce((a, t) => a - t.realised!, 0);
  return { year, gains, losses, net: gains - losses, sales: sells.length };
}

export interface Offset {
  symbol: string;
  /** loss if sold at today's price */
  loss: number;
  /** tax that loss would save against this year's net gain */
  saves: number;
}

/** Holdings at a loss, and how much tax selling each would save against the year's net gain so far. */
export function lossOffsets(holdings: { symbol: string; shares: number; avgCost: number; price: number }[], netGain: number, rate: number): Offset[] {
  let left = Math.max(0, netGain);
  return holdings
    .map((h) => ({ symbol: h.symbol, loss: (h.avgCost - h.price) * h.shares }))
    .filter((x) => x.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .map((x) => {
      const used = Math.min(left, x.loss);
      left -= used;
      return { ...x, saves: used * rate };
    });
}

// ------------------------------------------------------ imported history ----

export interface PastTrade {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
}

type Bought = 'recent' | '2022-24' | '2013-22' | 'pre2013';
const boughtOf = (date: string): Bought => (date < '2013-07-01' ? 'pre2013' : date < '2022-07-01' ? '2013-22' : date < '2024-07-01' ? '2022-24' : 'recent');

/**
 * Replays past trades in date order: average cost and realised profit per sale,
 * and which buys are still held (first in, first out) to know when the shares
 * you hold now were bought, for capital gains tax.
 */
export function replayTrades(past: PastTrade[]) {
  const sorted = [...past].sort((a, b) => a.date.localeCompare(b.date) || (a.side === 'buy' ? -1 : 1));
  const pos = new Map<string, { shares: number; avgCost: number; lots: { date: string; shares: number }[] }>();
  const records: TradeRecord[] = [];
  const incomplete = new Set<string>();
  for (const t of sorted) {
    const p = pos.get(t.symbol) ?? { shares: 0, avgCost: 0, lots: [] };
    if (t.side === 'buy') {
      const shares = p.shares + t.shares;
      records.push({ day: t.date, symbol: t.symbol, side: 'buy', shares: t.shares, price: t.price, avgCost: p.avgCost || t.price, realised: null });
      pos.set(t.symbol, { shares, avgCost: (p.shares * p.avgCost + t.shares * t.price) / shares, lots: [...p.lots, { date: t.date, shares: t.shares }] });
    } else {
      // selling more than the history shows was bought: the history starts too late for this stock
      const known = Math.min(t.shares, p.shares);
      if (known < t.shares) incomplete.add(t.symbol);
      records.push({ day: t.date, symbol: t.symbol, side: 'sell', shares: t.shares, price: t.price, avgCost: p.avgCost, realised: known === t.shares && p.shares > 0 ? (t.price - p.avgCost) * t.shares : null });
      let left = known;
      const lots = p.lots.map((l) => ({ ...l }));
      while (left > 0 && lots.length) {
        const take = Math.min(left, lots[0].shares);
        lots[0].shares -= take;
        left -= take;
        if (!lots[0].shares) lots.shift();
      }
      const shares = p.shares - known;
      pos.set(t.symbol, { shares, avgCost: shares ? p.avgCost : 0, lots });
    }
  }
  const positions = new Map([...pos].filter(([, p]) => p.shares > 0).map(([s, p]) => [s, { shares: p.shares, avgCost: p.avgCost, lots: p.lots }]));
  /** when the shares still held were bought, if all in one tax period */
  const bought = new Map<string, Bought>();
  for (const [s, p] of positions) {
    const kinds = new Set(p.lots.map((l) => boughtOf(l.date)));
    bought.set(s, kinds.size === 1 ? [...kinds][0] : 'recent');
  }
  return { records, positions, bought, incomplete };
}

const recKey = (t: TradeRecord) => `${t.day}|${t.symbol}|${t.side}|${t.shares}|${t.price}`;

/** Adds imported trades to the log, skipping ones already there. Returns how many were new. */
export async function mergeTrades(records: TradeRecord[]): Promise<number> {
  const cur = await tradesPref.get();
  const have = new Set(cur.map(recKey));
  const fresh = records.filter((r) => !have.has(recKey(r)));
  await tradesPref.set([...cur, ...fresh].sort((a, b) => a.day.localeCompare(b.day)).slice(-2000));
  return fresh.length;
}
