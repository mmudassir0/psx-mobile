/** A rights issue's three choices in rupees: subscribe, sell the rights, or do nothing. */
import { rightsMaths } from '../analysis/dividends';

export interface RightsChoice {
  entitled: number;
  cost: number;
  terp: number;
  perRight: number;
  /** subscribe: shares and average after */
  newShares: number;
  newAvg: number;
  /** what your holding is worth after the issue, for each choice (rupees), with cash received or paid */
  subscribe: { worth: number; cash: number };
  sell: { worth: number; cash: number };
  nothing: { worth: number; cash: number };
  /** what doing nothing loses against selling the rights */
  lostByNothing: number;
}

export function rightsChoice(shares: number, avg: number, pct: number, price: number, offer: number): RightsChoice | null {
  if (!(shares > 0 && price > 0 && offer > 0 && pct > 0)) return null;
  const m = rightsMaths(shares, pct, price, offer);
  const newShares = shares + m.entitled;
  return {
    entitled: m.entitled,
    cost: m.cost,
    terp: m.terp,
    perRight: m.perRight,
    newShares,
    newAvg: newShares ? (shares * avg + m.cost) / newShares : avg,
    subscribe: { worth: newShares * m.terp, cash: -m.cost },
    sell: { worth: shares * m.terp, cash: m.valueOfRights },
    nothing: { worth: shares * m.terp, cash: 0 },
    lostByNothing: m.valueOfRights,
  };
}
