/**
 * The top of PSX's order book: the best price buyers are bidding and sellers are
 * asking, with the shares waiting at each. PSX publishes only these best prices,
 * not the full queue at every price.
 */
export interface BookView {
  bid: number;
  ask: number;
  bidVol: number;
  askVol: number;
  spread: number;
  /** spread as a share of the middle price */
  spreadPct: number;
  /** buyers' share of the shares waiting, 0–1 */
  buyers: number;
  liquidity: 'easy' | 'ok' | 'thin';
  text: string;
}

export function bookView(q: { bid: number | null; ask: number | null; bidVol: number | null; askVol: number | null }): BookView | null {
  const { bid, ask } = q;
  if (!(bid && ask && bid > 0 && ask > 0 && ask >= bid)) return null;
  const bidVol = q.bidVol ?? 0;
  const askVol = q.askVol ?? 0;
  const spread = ask - bid;
  const mid = (ask + bid) / 2;
  const spreadPct = spread / mid;
  const buyers = bidVol + askVol > 0 ? bidVol / (bidVol + askVol) : 0.5;
  const liquidity = spreadPct <= 0.003 ? 'easy' : spreadPct <= 0.01 ? 'ok' : 'thin';
  const side =
    buyers >= 0.65
      ? 'More shares are waiting to be bought than sold at the best prices.'
      : buyers <= 0.35
        ? 'More shares are waiting to be sold than bought at the best prices.'
        : 'Buyers and sellers are about balanced at the best prices.';
  const ease =
    liquidity === 'easy'
      ? 'The gap between buyers and sellers is small, so trading costs little in price.'
      : liquidity === 'ok'
        ? 'A moderate gap: use a limit order to avoid paying it all.'
        : 'A wide gap: a market order could fill well away from the last price, so use a limit order.';
  return { bid, ask, bidVol, askVol, spread, spreadPct, buyers, liquidity, text: `${side} ${ease}` };
}
