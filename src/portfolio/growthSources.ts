/**
 * Where your gains came from: price rises on what you hold and have sold, and the
 * dividends paid to you, with how much of the dividend cash went back into shares
 * (each recorded buy is taken to use dividend cash first, while there is some).
 */

export interface DividendIn {
  day: string;
  symbol: string;
  /** after tax, rupees */
  amount: number;
}

export interface BuyOrSell {
  day: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  realised: number | null;
}

export interface GrowthSources {
  /** unrealised, on what you hold now */
  priceNow: number;
  /** realised on sales */
  priceSold: number;
  dividends: number;
  reinvested: number;
  /** today's value of the shares bought with dividend cash */
  reinvestedNow: number;
  /** dividend cash not (yet) put back into shares */
  unspent: number;
  /** each symbol's shares bought with dividend cash */
  fromDividends: Record<string, number>;
  /** dividends by symbol */
  bySymbol: Record<string, number>;
}

export function growthSources(input: { holdings: { symbol: string; shares: number; avgCost: number; price: number }[]; trades: BuyOrSell[]; dividends: DividendIn[] }): GrowthSources {
  const events = [...input.dividends.map((d) => ({ day: d.day, order: 0, d })), ...input.trades.map((t) => ({ day: t.day, order: 1, t }))].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order));
  let pool = 0;
  let reinvested = 0;
  const fromDividends: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  for (const e of events) {
    if ('d' in e && e.d) {
      pool += e.d.amount;
      bySymbol[e.d.symbol] = (bySymbol[e.d.symbol] ?? 0) + e.d.amount;
    } else if ('t' in e && e.t) {
      const t = e.t;
      if (t.side === 'buy' && pool > 0 && t.price > 0) {
        const use = Math.min(pool, t.shares * t.price);
        pool -= use;
        reinvested += use;
        fromDividends[t.symbol] = (fromDividends[t.symbol] ?? 0) + use / t.price;
      } else if (t.side === 'sell' && fromDividends[t.symbol]) {
        // a sale takes dividend-bought shares out in proportion
        const held = input.trades.filter((x) => x.symbol === t.symbol && x.day <= t.day && x !== t).reduce((a, x) => a + (x.side === 'buy' ? x.shares : -x.shares), 0);
        if (held > 0) fromDividends[t.symbol] *= Math.max(0, 1 - t.shares / held);
      }
    }
  }
  const price = new Map(input.holdings.map((h) => [h.symbol, h]));
  let reinvestedNow = 0;
  for (const [s, n] of Object.entries(fromDividends)) {
    const h = price.get(s);
    if (h) reinvestedNow += Math.min(n, h.shares) * h.price;
  }
  return {
    priceNow: input.holdings.reduce((a, h) => a + (h.price - h.avgCost) * h.shares, 0),
    priceSold: input.trades.reduce((a, t) => a + (t.side === 'sell' && t.realised != null ? t.realised : 0), 0),
    dividends: input.dividends.reduce((a, d) => a + d.amount, 0),
    reinvested,
    reinvestedNow,
    unspent: pool,
    fromDividends,
    bySymbol,
  };
}
