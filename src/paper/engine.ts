/**
 * Paper-trading engine. Pure functions over an Account value, so the rules
 * are easy to test and the store just persists whatever comes back.
 *
 * Fill rules (against the latest traded price):
 *   market            fills now
 *   limit  buy/sell   fills once price <= / >= the limit
 *   stop   sell/buy   triggers once price <= / >= the stop, fills at that price
 * Commission is a flat estimate on traded value; real brokers differ.
 */

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export const FEE_RATE = 0.0015;
export const START_CASH = 1_000_000;

export interface Position {
  qty: number;
  /** average cost per share, commission included */
  avgCost: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  /** limit price, or stop trigger */
  price?: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  fillPrice?: number;
  fee?: number;
  reason?: string;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  at: number;
  /** realised P&L of a sell, after commission */
  realized?: number;
}

export interface Account {
  cash: number;
  startCash: number;
  positions: Record<string, Position>;
  orders: Order[];
  fills: Fill[];
  realized: number;
  createdAt: number;
}

export interface OrderInput {
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  price?: number;
}

export function newAccount(now = Date.now(), cash = START_CASH): Account {
  return { cash, startCash: cash, positions: {}, orders: [], fills: [], realized: 0, createdAt: now };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
export const feeFor = (value: number) => r2(value * FEE_RATE);

let counter = 0;
function newId(now: number) {
  counter = (counter + 1) % 1000;
  return `${now.toString(36)}${counter.toString(36)}`;
}

/** Cash held back for open buy orders. */
export function reservedCash(acc: Account): number {
  return acc.orders
    .filter((o) => o.status === 'open' && o.side === 'buy' && o.price != null)
    .reduce((sum, o) => sum + o.qty * (o.price as number) * (1 + FEE_RATE), 0);
}

/** Shares held back for open sell orders. */
export function reservedShares(acc: Account, symbol: string): number {
  return acc.orders
    .filter((o) => o.status === 'open' && o.side === 'sell' && o.symbol === symbol)
    .reduce((sum, o) => sum + o.qty, 0);
}

export function buyingPower(acc: Account): number {
  return Math.max(0, r2(acc.cash - reservedCash(acc)));
}

export function availableShares(acc: Account, symbol: string): number {
  return Math.max(0, (acc.positions[symbol]?.qty ?? 0) - reservedShares(acc, symbol));
}

function shouldFill(o: Order, last: number): boolean {
  if (o.type === 'market') return true;
  const p = o.price as number;
  if (o.type === 'limit') return o.side === 'buy' ? last <= p : last >= p;
  return o.side === 'sell' ? last <= p : last >= p;
}

function applyFill(acc: Account, o: Order, price: number, now: number): Account {
  const value = r2(price * o.qty);
  const fee = feeFor(value);
  const positions = { ...acc.positions };
  const pos = positions[o.symbol];
  let cash = acc.cash;
  let realized = acc.realized;
  let fillRealized: number | undefined;

  if (o.side === 'buy') {
    // A buy stop fills at the price it jumped to, which can be above what it reserved;
    // it may only use cash not held back for the other open buy orders.
    const others = acc.orders
      .filter((x) => x.id !== o.id && x.status === 'open' && x.side === 'buy' && x.price != null)
      .reduce((sum, x) => sum + x.qty * (x.price as number) * (1 + FEE_RATE), 0);
    if (value + fee > cash - others + 0.005) {
      return updateOrder(acc, o.id, { status: 'rejected', reason: 'Not enough cash when the order triggered', updatedAt: now });
    }
    cash = r2(cash - value - fee);
    const qty = (pos?.qty ?? 0) + o.qty;
    const cost = (pos ? pos.qty * pos.avgCost : 0) + value + fee;
    positions[o.symbol] = { qty, avgCost: cost / qty };
  } else {
    if (!pos || pos.qty < o.qty) {
      return updateOrder(acc, o.id, { status: 'rejected', reason: 'Not enough shares when the order triggered', updatedAt: now });
    }
    cash = r2(cash + value - fee);
    fillRealized = r2(value - fee - pos.avgCost * o.qty);
    realized = r2(realized + fillRealized);
    const left = pos.qty - o.qty;
    if (left > 0) positions[o.symbol] = { qty: left, avgCost: pos.avgCost };
    else delete positions[o.symbol];
  }

  const fill: Fill = { orderId: o.id, symbol: o.symbol, side: o.side, qty: o.qty, price, fee, at: now, realized: fillRealized };
  const next = { ...acc, cash, positions, realized, fills: [fill, ...acc.fills].slice(0, 500) };
  return updateOrder(next, o.id, { status: 'filled', fillPrice: price, fee, updatedAt: now });
}

function updateOrder(acc: Account, id: string, patch: Partial<Order>): Account {
  return { ...acc, orders: acc.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}

export type PlaceResult = { ok: true; account: Account; order: Order } | { ok: false; error: string };

export function placeOrder(acc: Account, input: OrderInput, last: number | null, now = Date.now()): PlaceResult {
  const qty = Math.floor(input.qty);
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: 'Enter a quantity of at least 1 share' };
  if (input.type !== 'market' && !(input.price != null && input.price > 0)) {
    return { ok: false, error: input.type === 'limit' ? 'Enter a limit price' : 'Enter a stop price' };
  }
  if (last == null || !(last > 0)) return { ok: false, error: 'No live price for this stock yet' };

  if (input.side === 'buy') {
    const est = input.type === 'market' ? last : (input.price as number);
    const cost = est * qty * (1 + FEE_RATE);
    if (cost > buyingPower(acc) + 0.005) return { ok: false, error: 'Not enough buying power for this order' };
  } else {
    const avail = availableShares(acc, input.symbol);
    if (avail <= 0) return { ok: false, error: `You don't hold any ${input.symbol}` };
    if (qty > avail) return { ok: false, error: `You can sell up to ${avail} shares` };
  }

  const order: Order = {
    id: newId(now),
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty,
    price: input.type === 'market' ? undefined : r2(input.price as number),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  let next: Account = { ...acc, orders: [order, ...acc.orders].slice(0, 500) };
  if (shouldFill(order, last)) next = applyFill(next, order, last, now);
  return { ok: true, account: next, order: next.orders.find((o) => o.id === order.id) as Order };
}

/** Check every open order against the latest prices. */
export function processOpenOrders(acc: Account, priceOf: (symbol: string) => number | null, now = Date.now()): Account {
  let next = acc;
  for (const o of acc.orders) {
    if (o.status !== 'open') continue;
    const last = priceOf(o.symbol);
    if (last != null && last > 0 && shouldFill(o, last)) next = applyFill(next, o, last, now);
  }
  return next;
}

export function cancelOrder(acc: Account, id: string, now = Date.now()): Account {
  const o = acc.orders.find((x) => x.id === id);
  if (!o || o.status !== 'open') return acc;
  return updateOrder(acc, id, { status: 'cancelled', updatedAt: now });
}

export interface Valuation {
  holdingsValue: number;
  costBasis: number;
  unrealized: number;
  unrealizedPct: number;
  dayChange: number;
  total: number;
  totalReturn: number;
  totalReturnPct: number;
}

export function valuePortfolio(
  acc: Account,
  quote: (symbol: string) => { price: number | null; change: number | null } | undefined,
): Valuation {
  let holdingsValue = 0;
  let costBasis = 0;
  let dayChange = 0;
  for (const [sym, p] of Object.entries(acc.positions)) {
    const q = quote(sym);
    const price = q?.price ?? p.avgCost;
    holdingsValue += price * p.qty;
    costBasis += p.avgCost * p.qty;
    if (q?.change != null) dayChange += q.change * p.qty;
  }
  const unrealized = holdingsValue - costBasis;
  const total = acc.cash + holdingsValue;
  return {
    holdingsValue,
    costBasis,
    unrealized,
    unrealizedPct: costBasis > 0 ? (unrealized / costBasis) * 100 : 0,
    dayChange,
    total,
    totalReturn: total - acc.startCash,
    totalReturnPct: acc.startCash > 0 ? ((total - acc.startCash) / acc.startCash) * 100 : 0,
  };
}
