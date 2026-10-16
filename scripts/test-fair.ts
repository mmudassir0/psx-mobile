import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseCompany, parseHistorical, parseTimeseries } from '../src/psx/parse';
import { fairText, fairValue, FairInput, fiscalEndMonth, LONG_GROWTH, pastPEs, REQUIRED_RETURN } from '../src/analysis/fairValue';
import { peerValuations } from '../src/analysis/valuation';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const near = (a: number | undefined, b: number, tol = 1e-6) => a != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

check('fiscal year end month', fiscalEndMonth('June') === 5 && fiscalEndMonth('30 September') === 8 && fiscalEndMonth(null) === 11);

// LUCK: PSX's 2023 EPS (43.06) is from before the share split; past P/E must use profit ÷ today's shares.
const luck = parseCompany('LUCK', f('company_LUCK.html'));
const daily = adjustCandles(parseHistorical(f('historical_LUCK.html')), parseTimeseries(JSON.parse(f('eod_LUCK.json'))));
const past = pastPEs(luck.financialsAnnual, luck.shares, luck.fiscalYearEnd, daily);
const y23 = past.find((p) => p.year === '2023');
const eps23 = (13725814 * 1000) / luck.shares!;
const fy23 = daily.filter((b) => b.t >= Date.UTC(2022, 6, 1) && b.t < Date.UTC(2023, 6, 1));
const avg23 = fy23.reduce((a, b) => a + b.c, 0) / fy23.length;
check('past P/E uses split-adjusted EPS and the fiscal year July–June', !!y23 && near(y23.pe, avg23 / eps23), { got: y23?.pe, want: avg23 / eps23 });
check('past P/Es are plausible for a cement company', past.length === 4 && past.every((p) => p.pe > 4 && p.pe < 20), past);

const base: FairInput = {
  symbol: 'X',
  price: 100,
  pe: 10, // EPS 10
  shares: 1e6,
  sector: 'Fertilizer',
  annual: { periods: ['2025', '2024'], rows: [{ label: 'Profit after Taxation', values: [10000, 9000] }] },
  fiscalYearEnd: 'December',
  bookValuePerShare: 50,
  roe: 0.2,
  isBank: false,
  peers: [
    { symbol: 'A', pe: 8, pb: 1 },
    { symbol: 'B', pe: 12, pb: 2 },
    { symbol: 'C', pe: 14, pb: 3 },
    { symbol: 'D', pe: -5, pb: null }, // loss-maker ignored
    { symbol: 'E', pe: 300, pb: 40 }, // outliers ignored
  ],
};
const fv = fairValue(base)!;
const m = Object.fromEntries(fv.methods.map((x) => [x.id, x.value]));
check('sector P/E = EPS × median peer P/E (losses and outliers left out)', near(m.peerPE, 10 * 12));
check('sector P/B = book × median peer P/B', near(m.peerPB, 50 * 2));
const just = (50 * (0.2 - LONG_GROWTH)) / (REQUIRED_RETURN - LONG_GROWTH);
check('justified P/B = book × (ROE − g)/(r − g)', near(m.justifiedPB, just), [m.justifiedPB, just]);
check('no own past P/E without price history', m.ownPE === undefined);
check('midpoint is the median of the methods', near(fv.mid, [120, 100, just].sort((a, b) => a - b)[1]) && near(fv.low, Math.min(120, 100, just)) && near(fv.high, 120));
check('label: price within 15% of midpoint is fairly valued', fv.label === 'Fairly valued', fv.mid);
check('label: cheap is undervalued', fairValue({ ...base, price: 70, pe: 7 })!.label === 'Undervalued');
check('label: dear is overvalued', fairValue({ ...base, price: 160, pe: 16 })!.label === 'Overvalued');
check('fertilizer is not flagged as cyclical', !fv.flags.some((t) => /Cyclical/.test(t)));
check('cement is flagged as cyclical', fairValue({ ...base, sector: 'CEMENT' })!.flags.some((t) => /Cyclical/.test(t)));

const loss = fairValue({ ...base, pe: -4 })!;
check('loss-maker: only book-value methods', loss.methods.every((x) => x.id === 'peerPB' || x.id === 'justifiedPB') && loss.flags.some((t) => /no trailing profit/.test(t)));
const weak = fairValue({ ...base, roe: 0.04 })!;
check('ROE below growth: no justified P/B, and a flag', !weak.methods.some((x) => x.id === 'justifiedPB') && weak.flags.some((t) => /cost of capital/.test(t)));
check('ROE barely above growth gives no ROE value (it would be near zero)', !fairValue({ ...base, roe: 0.08 })!.methods.some((x) => x.id === 'justifiedPB'));
check('ROE is capped at 35%', near(fairValue({ ...base, roe: 0.9 })!.methods.find((x) => x.id === 'justifiedPB')!.value, (50 * (0.35 - LONG_GROWTH)) / (REQUIRED_RETURN - LONG_GROWTH)));
const one = fairValue({ ...base, bookValuePerShare: null, peers: base.peers.slice(0, 2) });
check('fewer than 3 peers and no book: no estimate', one === null);
const jump = fairValue({ ...base, annual: { periods: ['2025', '2024'], rows: [{ label: 'Profit after Taxation', values: [20000, 9000] }] } })!;
check('a profit jump is flagged', jump.flags.some((t) => /Profit rose 122%/.test(t)), jump.flags);
check('wide disagreement is flagged', fairValue({ ...base, roe: 0.095 })!.flags.some((t) => /disagree/.test(t)));
check('one method gives no label', fairValue({ ...base, bookValuePerShare: null })!.label === null);
const txt = fairText(fv, 100);
check('AI text carries range, methods and assumptions', txt.startsWith('FAIR VALUE') && txt.includes('Sector P/E') && txt.includes('Required return 18.3%'), txt);

const pv = peerValuations(
  [{ symbol: 'A', pe: 8, marketCap: 3e9 } as never, { symbol: 'B', pe: 9, marketCap: 1e9 } as never],
  (s) => (s === 'A' ? ({ equity: 1.5e9 } as never) : null),
);
check('peer P/B = market cap ÷ equity', pv[0].pb === 2 && pv[1].pb === null);

if (failed) {
  console.log(`\n${failed} fair value check(s) failed`);
  process.exit(1);
}
console.log('\nall fair value checks passed');
