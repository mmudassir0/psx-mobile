import {
  availableShares, buyingPower, cancelOrder, newAccount, placeOrder, processOpenOrders, valuePortfolio, FEE_RATE,
} from '../src/paper/engine';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

let acc = newAccount(0, 100_000);

// Market buy fills at last price, commission charged.
let r = placeOrder(acc, { symbol: 'LUCK', side: 'buy', type: 'market', qty: 100 }, 400, 1);
check('market buy ok', r.ok);
if (r.ok) acc = r.account;
const fee1 = 400 * 100 * FEE_RATE;
check('cash after buy', near(acc.cash, 100_000 - 40_000 - fee1), acc.cash);
check('position avg includes fee', near(acc.positions.LUCK.avgCost, (40_000 + fee1) / 100), acc.positions.LUCK);

// Not enough cash.
r = placeOrder(acc, { symbol: 'LUCK', side: 'buy', type: 'market', qty: 1000 }, 400, 2);
check('rejects buy over buying power', !r.ok);

// Limit buy below market stays open and reserves cash.
r = placeOrder(acc, { symbol: 'MEBL', side: 'buy', type: 'limit', qty: 50, price: 300 }, 320, 3);
check('limit buy open', r.ok && r.order.status === 'open');
if (r.ok) acc = r.account;
check('buying power reduced by reservation', near(buyingPower(acc), acc.cash - 50 * 300 * (1 + FEE_RATE)), buyingPower(acc));

// Price drops to 299 -> fills at 299.
acc = processOpenOrders(acc, (s) => (s === 'MEBL' ? 299 : 400), 4);
check('limit buy filled on drop', acc.positions.MEBL?.qty === 50 && acc.orders.find((o) => o.symbol === 'MEBL')?.fillPrice === 299);

// Sell more than held is refused.
r = placeOrder(acc, { symbol: 'LUCK', side: 'sell', type: 'market', qty: 101 }, 410, 5);
check('rejects oversell', !r.ok && /up to 100/.test(r.error), r.ok ? null : r.error);

// Stop-loss sell triggers below trigger.
r = placeOrder(acc, { symbol: 'LUCK', side: 'sell', type: 'stop', qty: 40, price: 390 }, 405, 6);
check('stop open', r.ok && r.order.status === 'open');
if (r.ok) acc = r.account;
check('reserved shares', availableShares(acc, 'LUCK') === 60);
acc = processOpenOrders(acc, () => 395, 7);
check('stop not yet', acc.positions.LUCK.qty === 100);
acc = processOpenOrders(acc, () => 389.5, 8);
check('stop triggered', acc.positions.LUCK.qty === 60, acc.positions.LUCK);
const lastFill = acc.fills[0];
check('realized loss recorded', lastFill.realized != null && lastFill.realized < 0, lastFill);

// Cancel an open order.
r = placeOrder(acc, { symbol: 'LUCK', side: 'sell', type: 'limit', qty: 10, price: 500 }, 390, 9);
if (r.ok) acc = r.account;
const openId = acc.orders.find((o) => o.status === 'open')!.id;
acc = cancelOrder(acc, openId, 10);
check('cancelled', acc.orders.find((o) => o.id === openId)?.status === 'cancelled' && availableShares(acc, 'LUCK') === 60);

// Sell everything removes the position.
r = placeOrder(acc, { symbol: 'MEBL', side: 'sell', type: 'market', qty: 50 }, 310, 11);
if (r.ok) acc = r.account;
check('position closed', !acc.positions.MEBL);

const v = valuePortfolio(acc, (s) => (s === 'LUCK' ? { price: 400, change: 5 } : undefined));
check('valuation total = cash + holdings', near(v.total, acc.cash + 60 * 400), v);
check('day change', near(v.dayChange, 300), v.dayChange);

// A buy stop that gaps up can't spend the cash held for another open buy order.
{
  let g = newAccount(0, 100_000);
  const a = placeOrder(g, { symbol: 'HUBC', side: 'buy', type: 'limit', qty: 100, price: 400 }, 420, 1);
  if (a.ok) g = a.account;
  const b = placeOrder(g, { symbol: 'PSO', side: 'buy', type: 'stop', qty: 140, price: 400 }, 390, 2);
  check('buy stop placed beside a buy limit', a.ok && b.ok);
  if (b.ok) g = b.account;
  g = processOpenOrders(g, (s) => (s === 'PSO' ? 450 : 420), 3); // PSO gaps to 450: 63,000 + fee
  const stop = g.orders.find((o) => o.symbol === 'PSO');
  check('gapped buy stop is refused rather than using the limit order\'s cash', stop?.status === 'rejected' && !g.positions.PSO, stop);
  g = processOpenOrders(g, (s) => (s === 'HUBC' ? 399 : 450), 4);
  check('the buy limit still fills afterwards', g.positions.HUBC?.qty === 100, g.orders.find((o) => o.symbol === 'HUBC'));
  let h = newAccount(0, 100_000);
  const c = placeOrder(h, { symbol: 'PSO', side: 'buy', type: 'stop', qty: 100, price: 400 }, 390, 1);
  if (c.ok) h = c.account;
  h = processOpenOrders(h, () => 430, 2);
  check('a gapped buy stop with enough free cash fills at the gap price', h.positions.PSO?.qty === 100 && h.orders[0].fillPrice === 430);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall engine checks passed');
