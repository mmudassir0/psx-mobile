import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractToken, parseCompany, parseIndices, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard,
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

check('token', extractToken(f('company_LUCK.html')) === 'Aw_AcY4Fsk0YAsCSq3nhOQZt0tqHWXNRwM15r5qV_yM');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall parser checks passed');
