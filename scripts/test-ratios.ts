import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCompany, parseScreener } from '../src/psx/parse';
import { BalanceSheet, computeRatios } from '../src/analysis/ratios';
import type { Stock } from '../src/psx/types';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number | null, b: number, tol = 1e-3) => a != null && Math.abs(a - b) <= tol * Math.abs(b);
const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

const co = parseCompany('LUCK', f('company_LUCK.html'));
const scr = parseScreener(f('screener.html')).find((s) => s.symbol === 'LUCK')!;
const stock = { symbol: 'LUCK', price: 405.38, pe: scr.pe, divYield: scr.divYield, marketCap: scr.marketCap } as Stock;

// LUCK standalone balance sheet, 30 June 2026 (annual report p. 236), rupees.
const bs: BalanceSheet = {
  periodEnd: '2026-06-30', statement: 'standalone', isBank: false,
  equity: 216_641_607_000, assets: 301_409_878_000, liabilities: 84_768_271_000,
  currentAssets: 127_042_576_000, currentLiabilities: 53_105_221_000,
  borrowings: (7_339_816 + 1_822_195 + 9_610_000) * 1000, cash: 1_530_592_000,
  source: { title: 'Annual report', url: 'x', date: '2026-09-04', pages: [236] },
};
const r = computeRatios(bs, co, stock);
const ttmProfit = (405.38 / (scr.pe as number)) * 1_465_000_000;
check('TTM profit from P/E', r.profitBasis === 'ttm' && near(r.profit, ttmProfit), r.profit);
check('ROE', near(r.roe, ttmProfit / 216_641_607_000), r.roe);
check('ROA', near(r.roa, ttmProfit / 301_409_878_000), r.roa);
check('book value per share', near(r.bookValuePerShare, 216_641_607_000 / 1_465_000_000), r.bookValuePerShare);
check('price to book', near(r.priceToBook, 405.38 / (216_641_607_000 / 1_465_000_000)), r.priceToBook);
check('current ratio', near(r.currentRatio, 127_042_576 / 53_105_221), r.currentRatio);
check('debt to equity', near(r.debtToEquity, 18_772_011 / 216_641_607), r.debtToEquity);
check('equity to assets', near(r.equityToAssets, 216_641_607 / 301_409_878), r.equityToAssets);
check('price to sales', near(r.priceToSales, (scr.marketCap as number) / 136_527_017_000), r.priceToSales);
const dps = ((scr.divYield as number) / 100) * 405.38;
check('payout ratio', near(r.payoutRatio, dps / 31.83), r.payoutRatio);
check('dividend cover', near(r.dividendCover, 31.83 / dps), r.dividendCover);

const bank = computeRatios({ ...bs, isBank: true }, co, stock);
check('no current ratio for banks', bank.currentRatio === null);
const none = computeRatios(null, co, stock);
check('without a balance sheet only market ratios', none.roe === null && none.priceToBook === null && none.priceToSales !== null);
const noPe = computeRatios(bs, { ...co, pe: null }, { ...stock, pe: null });
check('falls back to fiscal-year profit', noPe.profitBasis === 'fiscal' && near(noPe.profit, 46_629_367_000), noPe.profit);

if (failed) {
  console.log(`\n${failed} ratio check(s) failed`);
  process.exit(1);
}
console.log('\nall ratio checks passed');
