import { companiesFor, starterPlan } from '../src/portfolio/starter';
import type { Stock } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const S = (symbol: string, sector: string, price: number, cap: number, o: Partial<Stock> = {}): Stock => ({
  symbol,
  name: symbol + ' Ltd',
  sector,
  price,
  change: 0,
  changePct: 0,
  ldcp: price,
  volume: 100_000,
  shariah: true,
  indexes: ['KSE100', 'KMI30'],
  marketCap: cap,
  pe: 6,
  divYield: 7,
  change1y: 0,
  bid: null,
  bidVol: null,
  ask: null,
  askVol: null,
  ...o,
});
const stocks: Stock[] = [
  S('OGDC', 'OIL & GAS EXPLORATION COMPANIES', 300, 1300),
  S('PPL', 'OIL & GAS EXPLORATION COMPANIES', 215, 600),
  S('MEBL', 'COMMERCIAL BANKS', 550, 1000),
  S('UBL', 'COMMERCIAL BANKS', 400, 1100, { shariah: false, indexes: ['KSE100'] }),
  S('FFC', 'FERTILIZER', 536, 800),
  S('LUCK', 'CEMENT', 400, 700),
  S('HUBC', 'POWER GENERATION & DISTRIBUTION', 190, 300),
  S('SYS', 'TECHNOLOGY & COMMUNICATION', 140, 400, { divYield: 1.5 }),
  S('LOSS', 'TEXTILE', 50, 900, { pe: -3 }),
  S('NODIV', 'AUTOMOBILE ASSEMBLER', 300, 500, { divYield: 0 }),
  S('MZNPETF', 'EXCHANGE TRADED FUNDS', 17, 10, { pe: null, divYield: null }),
  S('NITGETF', 'EXCHANGE TRADED FUNDS', 25, 10, { pe: null, divYield: null, shariah: false, volume: 900_000 }),
];

check('company count grows with money', companiesFor(20_000) === 1 && companiesFor(50_000) === 3 && companiesFor(100_000) === 5 && companiesFor(300_000) === 7 && companiesFor(1e6) === 10);

const small = starterPlan(stocks, 20_000, { shariah: true })!;
check(
  'under Rs 25,000: one Shariah index fund',
  small.etf && small.lines.length === 1 && small.lines[0].symbol === 'MZNPETF',
  small.lines.map((l) => l.symbol),
);
const smallAny = starterPlan(stocks, 20_000, { shariah: false })!;
check('not Shariah-only: the busiest fund', smallAny.lines[0].symbol === 'NITGETF');

const mid = starterPlan(stocks, 100_000, { shariah: true })!;
const syms = mid.lines.map((l) => l.symbol);
check('five companies, one per sector, biggest first', syms.length === 5 && syms[0] === 'OGDC' && !syms.includes('PPL'), syms);
check('Shariah-only skips a non-Shariah bank', !syms.includes('UBL'));
check('no loss-makers, no non-payers, no funds', !syms.includes('LOSS') && !syms.includes('NODIV') && !syms.includes('MZNPETF'));
check('never spends more than the cash, fees included', mid.spent <= 100_000 + 1e-6 && Math.abs(mid.spent + mid.left - 100_000) < 1e-6, { spent: mid.spent, left: mid.left });
check('little left over', mid.left < 600, mid.left);
check(
  'roughly even split',
  Math.max(...mid.lines.map((l) => l.amount)) - Math.min(...mid.lines.map((l) => l.amount)) < 1200,
  mid.lines.map((l) => l.amount),
);
check('fees counted', mid.fees > 0 && mid.lines.every((l) => l.cost > 0));

const any = starterPlan(stocks, 100_000, { shariah: false })!;
check(
  'any company: the bank can be UBL',
  any.lines.some((l) => l.symbol === 'UBL') && !any.lines.some((l) => l.symbol === 'MEBL'),
  any.lines.map((l) => l.symbol),
);
check('nothing for zero cash', starterPlan(stocks, 0, { shariah: true }) === null);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall starter checks passed');
