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
