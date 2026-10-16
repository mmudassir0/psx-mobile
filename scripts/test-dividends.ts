import { readFileSync } from 'fs';
import { join } from 'path';
import { dividends, inferFaceValue, parsePayouts } from '../src/analysis/dividends';
import { reviewHolding } from '../src/portfolio/review';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const luck = parsePayouts(readFileSync(join(__dirname, 'fixtures', 'payouts_LUCK.html'), 'utf8'));
check('parses PSX payouts table', luck.length === 2 && luck[0].period === '2026-06-30' && luck[0].periodType === 'YR' && luck[0].items[0].pct === 250 && luck[0].items[0].type === 'D', luck);
const now = Date.UTC(2026, 9, 16);
check('face value inferred from PSX yield (LUCK split to Rs 2)', inferFaceValue(luck, 405.38, 1.065, now) === 2);
check('no yield to compare: Rs 10', inferFaceValue(luck, 405.38, null, now) === 10);
const d = dividends(luck, { price: 400.56, divYield: 1.065, fiscalEndMonth: 5, latestFiscalYear: '2026', now });
check('per share and per fiscal year', d.ttm === 5 && d.years[0].fy === '2026' && d.years[0].dps === 5 && d.years[1].dps === 4 && !d.cut && !d.lower, d);

const row = (date: string, period: string, type: string, details: string, bc = '01/01/2026  - 07/01/2026') =>
  `<tr><td>${date}</td><td>${period}(${type})</td><td> ${details} </td><td>${bc}</td></tr>`;
const table = (rows: string[]) => `<table class="tbl"><thead class="tbl__head"><tr><th>Date</th></tr></thead><tbody class="tbl__body">${rows.join('')}</tbody></table>`;
const multi = parsePayouts(table([row('February 20, 2026 3:00 PM', '31/12/2025', 'YR', '30%(F) (D) 10%(B)')]));
check('cash and bonus in one announcement', multi[0].items.length === 2 && multi[0].items[1].type === 'B');
// Dec fiscal year; 2024: interim 20% + final 30% = 50%; 2025: final 10% only.
const cutP = parsePayouts(table([
  row('February 20, 2026 3:00 PM', '31/12/2025', 'YR', '10%(F) (D)'),
  row('February 22, 2025 3:00 PM', '31/12/2024', 'YR', '30%(F) (D)'),
  row('August 20, 2024 3:00 PM', '30/06/2024', 'HYR', '20%(i) (D)'),
]));
const c = dividends(cutP, { price: 50, divYield: null, fiscalEndMonth: 11, latestFiscalYear: '2025', now: Date.UTC(2026, 2, 1) });
check('interim and final add up per fiscal year', c.years.find((y) => y.fy === '2024')!.dps === 5 && c.years.find((y) => y.fy === '2025')!.dps === 1, c.years);
check('a cut of 80% is flagged', /cut from Rs 5.00 to Rs 1.00/.test(c.cut ?? ''), c.cut);
const skip = dividends(parsePayouts(table([row('February 22, 2025 3:00 PM', '31/12/2024', 'YR', '30%(F) (D)')])), { price: 50, divYield: null, fiscalEndMonth: 11, latestFiscalYear: '2025', now: Date.UTC(2026, 2, 1) });
check('a skipped year is flagged', /No cash dividend for fiscal 2025/.test(skip.cut ?? ''), skip.cut);
const interimOnly = dividends(parsePayouts(table([row('August 20, 2025 3:00 PM', '30/06/2025', 'HYR', '5%(i) (D)'), row('February 22, 2025 3:00 PM', '31/12/2024', 'YR', '30%(F) (D)')])), { price: 50, divYield: null, fiscalEndMonth: 11, latestFiscalYear: '2025', now: Date.UTC(2025, 9, 1) });
check('only an interim so far this year: not called a cut yet', interimOnly.cut === null && interimOnly.lower === null, interimOnly);
const base = { holding: { symbol: 'X', shares: 10, avgCost: 50 }, price: 50, weight: 0.05, sector: null, sectorWeight: 0.05, fund: false, series: null, analysis: null, company: { pe: 8, financialsAnnual: null } as never, ratios: null, hasBalanceSheet: false, isBank: false, fair: null, divYield: null };
check('a dividend cut makes a holding Review', reviewHolding({ ...base, dividends: c }).action === 'Review');
check('high trailing yield is a plus', reviewHolding({ ...base, price: 10, dividends: dividends(cutP, { price: 10, divYield: null, fiscalEndMonth: 11, latestFiscalYear: '2024', now: Date.UTC(2025, 6, 1) }) }).good.some((t) => /Dividend yield/.test(t)));

if (failed) {
  console.log(`\n${failed} dividend check(s) failed`);
  process.exit(1);
}
console.log('\nall dividend checks passed');
