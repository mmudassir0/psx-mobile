/** Tests for the tools: compare, dividend income plan, rebalance, what-if. Run with `npx tsx scripts/test-tools.ts`. */
import { changeOver, compareRows, maxDrawdown, rebased } from '../src/analysis/compare';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && !ok ? '  ' + JSON.stringify(detail).slice(0, 600) : ''}`);
}

// compare stocks
check('change over n sessions', Math.abs(changeOver([100, 110, 121], 2)! - 21) < 1e-9 && changeOver([1], 5) === null);
check('worst fall from a high', Math.abs(maxDrawdown([...Array(10).fill(100), 120, 90, 100, ...Array(10).fill(100)])! - -25) < 1e-9);
const rb = rebased([[{ t: 0, c: 10 }, { t: 864e5, c: 11 }, { t: 2 * 864e5, c: 12 }], [{ t: 864e5, c: 50 }, { t: 2 * 864e5, c: 25 }]]);
check('rebased to 100 from the first shared day', rb.length === 2 && rb[0].v[0] === 100 && rb[0].v[1] === 100 && Math.abs(rb[1].v[0] - 109.0909) < 1e-3 && rb[1].v[1] === 50, rb);
const mk = (sym: string, pe: number, dy: number) => ({ pack: { stock: { symbol: sym, name: sym, sector: 'Cement', price: 100, change: 0, changePct: 0, ldcp: 100, volume: 1, shariah: true, indexes: ['KSE100'], marketCap: 1e10, pe, divYield: dy, change1y: 0, bid: null, bidVol: null, ask: null, askVol: null }, company: null, analysis: null, tech: null, ratios: null, balance: null, peers: [], today: '2026-10-26' }, closes: Array.from({ length: 300 }, (_, i) => 100 + i * (sym === 'A' ? 0.1 : -0.1)) });
const cr = compareRows([mk('A', 8, 5), mk('B', 12, 5)]);
const row = (l: string) => cr.find((r) => r.label === l)!;
check('compare: lower P/E wins, equal yields have no star, 1-year leader marked', row('P/E').best.join() === '0' && row('Dividend yield').best.length === 0 && row('1 year').best.join() === '0' && row('Price').best.length === 0, cr.map((r) => [r.label, r.values, r.best]));

// --- end compare

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tool checks passed');
