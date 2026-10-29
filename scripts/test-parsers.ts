import { readFileSync } from 'fs';
import { join } from 'path';
import {
  adjustCandles, groupCandles, parseHistorical, parseIndexConstituents, ticksToCandles,
  extractToken, parseCompany, parseIndices, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard, sanePct,
} from '../src/psx/parse';

const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');
let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}

const idx = parseIndices(f('indices.html'));
const kse = idx.find((i) => i.code === 'KSE100');
check('indices parsed', idx.length >= 10, idx.length);
check('KSE100 current', kse?.current === 167089.27, kse);
check('KMI30 present', idx.some((i) => i.code === 'KMI30'));

const board = parseTradingBoard(f('board.html'));
const luck = board.find((b) => b.symbol === 'LUCK');
check('board rows', board.length > 400, board.length);
check('LUCK board price = LDCP + change', luck?.price === 405.38, luck);
check('no header row', !board.some((b) => b.symbol === 'SYMBOL'));
check('JUBS NC normalised', board.some((b) => b.symbol === 'JUBS'));

const scr = parseScreener(f('screener.html'));
const sl = scr.find((s) => s.symbol === 'LUCK');
check('screener rows', scr.length > 600, scr.length);
check('LUCK screener', !!sl && sl.price === 405.38, sl);
check('shariah flag from KMIALLSHR', scr.some((s) => s.shariah) && scr.some((s) => !s.shariah));

const sym = parseSymbols(JSON.parse(f('symbols.json')));
check('symbols', sym.length > 900 && sym.some((s) => s.symbol === 'MEBL' && s.sectorName === 'COMMERCIAL BANKS'), sym.length);

const eod = parseTimeseries(JSON.parse(f('eod_LUCK.json')));
check('eod sorted asc, last = 405.38', eod.length > 1000 && eod[eod.length - 1].v === 405.38 && eod[0].t < eod[1].t, eod[eod.length - 1]);
const intra = parseTimeseries(JSON.parse(f('int_LUCK.json')));
check('intraday', intra.length > 100 && intra[intra.length - 1].v === 405.38, intra.length);

const co = parseCompany('LUCK', f('company_LUCK.html'));
check('company name', co.name === 'Lucky Cement Limited', co.name);
check('company close/change', co.close === 405.38 && co.change === -1.74 && co.changePct === -0.43, [co.close, co.change, co.changePct]);
check('company OHLV', co.open === 408 && co.high === 409.9 && co.low === 404.58 && co.volume === 738899, [co.open, co.high, co.low, co.volume]);
check('52w', co.week52Low === 339 && co.week52High === 529.5, [co.week52Low, co.week52High]);
check('pe, mcap', co.pe === 12.74 && co.marketCap === 593881700000, [co.pe, co.marketCap]);
check('free float %', co.freeFloatPct === 30, co.freeFloatPct);
check('description', !!co.description && co.description.startsWith('Lucky Cement Limited was incorporated'), co.description?.slice(0, 60));
check('announcements', co.announcements.length >= 5 && !!co.announcements[0].url, co.announcements.slice(0, 2));
check('sector', co.sector === 'CEMENT', co.sector);
check('asOf', !!co.asOf && co.asOf.includes('2026'), co.asOf);
check('annual financials', co.financialsAnnual?.periods[0] === '2026' && co.financialsAnnual.rows.find((r) => r.label === 'EPS')?.values[0] === 31.83, co.financialsAnnual?.periods);
check('annual sales', co.financialsAnnual?.rows[0].label === 'Sales' && co.financialsAnnual.rows[0].values[3] === 95832147);
check('quarterly financials', co.financialsQuarterly?.periods[0] === 'Q3 2026' && co.financialsQuarterly.rows.find((r) => r.label === 'EPS')?.values[1] === 5.89, co.financialsQuarterly?.periods);
check('ratios with negatives', co.ratios?.rows.find((r) => r.label === 'EPS Growth (%)')?.values[2] === -56.08, co.ratios?.rows.map((r) => r.label));
check('key people', co.people.length === 3 && co.people[0].name === 'Muhammad Ali Tabba' && co.people[0].role === 'CEO', co.people);
check('website', co.website === 'http://www.lucky-cement.com', co.website);
check('address', !!co.address?.startsWith('Main Indus Highway'), co.address);
check('registrar', !!co.registrar?.includes('CDC Share Registrar'), co.registrar);
check('auditor', co.auditor === 'M/s A.F. Ferguson & Co. Chartered Accountants', co.auditor);
check('fiscal year end', co.fiscalYearEnd === 'June', co.fiscalYearEnd);

check('token', extractToken(f('company_LUCK.html')) === 'Aw_AcY4Fsk0YAsCSq3nhOQZt0tqHWXNRwM15r5qV_yM');

const raw = parseHistorical(f('historical_LUCK.html'));
check('historical rows', raw.length > 2000 && raw[0].t < raw[1].t, raw.length);
const lastRaw = raw[raw.length - 1];
check('historical last bar OHLC', lastRaw.o === 408 && lastRaw.h === 409.9 && lastRaw.l === 404.58 && lastRaw.c === 405.38 && lastRaw.v === 738899, lastRaw);
const adj = adjustCandles(raw, eod);
let maxJump = 0;
for (let i = 1; i < adj.length; i++) maxJump = Math.max(maxJump, Math.abs(adj[i].c / adj[i - 1].c - 1));
check('split removed (no >25% day jump)', maxJump < 0.25, maxJump.toFixed(3));
check('adjusted bars stay ordered h>=o,c>=l', adj.every((c) => c.h >= Math.max(c.o, c.c) - 0.02 && c.l <= Math.min(c.o, c.c) + 0.02));
check('recent bars unchanged', adj[adj.length - 1].c === 405.38 && adj[adj.length - 1].h === 409.9);
const apr2025 = adj.find((c) => c.t >= Date.UTC(2025, 3, 1));
check('pre-split bar rescaled', !!apr2025 && apr2025.c < 500, apr2025);
const weeks = groupCandles(adj.slice(-30), 'week');
check('weekly grouping', weeks.length >= 6 && weeks.length <= 8 && weeks[weeks.length - 1].c === 405.38, weeks.length);
const months = groupCandles(adj, 'month');
check('monthly grouping', months.length > 100 && months.length < 130, months.length);
const bars = ticksToCandles(intra.filter((p) => p.t > intra[intra.length - 1].t - 8 * 3600_000), 5);
check('5-min intraday candles', bars.length > 20 && bars.length < 120 && bars.every((b) => b.h >= b.l), bars.length);

const cons = parseIndexConstituents(f('index_KSE100.html'));
const abl = cons.find((x) => x.symbol === 'ABL');
check('KSE100 constituents', cons.length === 100, cons.length);
check('ABL row', !!abl && abl.price === 172.75 && abl.points === 6.0437 && abl.weight === 0.42 && abl.volume === 58118, abl);
const pts = cons.reduce((s, x) => s + (x.points ?? 0), 0);
check('points sum ~ index change (-352.63)', Math.abs(pts - -352.63) < 3, pts.toFixed(2));

// a day's change of 100% or more is a near-zero previous close (letters of rights), shown as unknown
check('impossible day change dropped', sanePct(10000) === null && sanePct(-150) === null && sanePct(19.89) === 19.89 && sanePct(null) === null);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall parser checks passed');

