import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseCompany, parseHistorical, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard } from '../src/psx/parse';
import { mergeStocks } from '../src/psx/merge';
import { analyze } from '../src/analysis/signals';
import { technicals } from '../src/analysis/technicals';
import { computeRatios } from '../src/analysis/ratios';
import { analysisMessages, median, stockContext } from '../src/ai/context';
import { mentionedSector, mentionedSymbols, screeningTable } from '../src/ai/chat';
import { MODELS, modelById } from '../src/ai/models';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}
const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

const stocks = mergeStocks(parseSymbols(JSON.parse(f('symbols.json'))), parseScreener(f('screener.html')), parseTradingBoard(f('board.html')));
const luck = stocks.find((s) => s.symbol === 'LUCK')!;
const company = parseCompany('LUCK', f('company_LUCK.html'));
const daily = adjustCandles(parseHistorical(f('historical_LUCK.html')), parseTimeseries(JSON.parse(f('eod_LUCK.json'))));
const peers = stocks.filter((s) => s.sector === luck.sector && s.symbol !== 'LUCK');
const ctx = stockContext({
  stock: luck,
  company,
  analysis: analyze(daily),
  tech: technicals(daily),
  ratios: computeRatios(null, company, luck),
  balance: null,
  peers,
  today: '2026-10-14',
});

check('pack names the stock and price', ctx.includes('STOCK LUCK') && ctx.includes('Rs 405.38'));
check('pack carries the signal score', ctx.includes('TECHNICAL SCORE 2.0/10 (Strong bearish)'));
check('pack carries annual EPS', ctx.includes('EPS 31.83'));
check('pack says when no balance sheet', ctx.includes('No balance sheet available'));
check('pack lists announcements', ctx.includes('RECENT ANNOUNCEMENTS'));
check('pack has no NaN or undefined', !/NaN|undefined|Infinity/.test(ctx), ctx.match(/.{30}(NaN|undefined|Infinity).{10}/)?.[0]);
check('pack fits a small model (< 6,000 chars)', ctx.length < 6000, ctx.length);
check('analysis prompt has system + user', analysisMessages(ctx).length === 2 && analysisMessages(ctx)[1].content.startsWith('STOCK LUCK'));
check('median', median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5 && median([]) === null);

check('finds tickers', JSON.stringify(mentionedSymbols('compare LUCK and DGKC', stocks)) === '["LUCK","DGKC"]', mentionedSymbols('compare LUCK and DGKC', stocks));
check('ignores common words', !mentionedSymbols('IS IT A BUY NOW', stocks).length, mentionedSymbols('IS IT A BUY NOW', stocks));
check('finds company names', mentionedSymbols('what about lucky cement?', stocks).includes('LUCK'), mentionedSymbols('what about lucky cement?', stocks));
const bankSector = mentionedSector('best bank stocks for dividends', stocks);
check('finds a sector', !!bankSector && /bank/i.test(bankSector), bankSector);
const table = screeningTable('shariah cement stocks', stocks);
check('screening filters sector and Shariah', table.includes('CEMENT') && table.includes('SHARIAH ONLY') && !table.split('\n').slice(3).some((l) => l.endsWith('| no')), table.split('\n').slice(0, 3));
const dcl = screeningTable('cement stocks', stocks).split('\n').find((l) => l.startsWith('DCL |'));
check('loss-makers show no P/E, not 0', !!dcl && dcl.split(' | ')[5] === '-', dcl);

check('model catalog points at official Qwen GGUF files', MODELS.every((m) => m.url.startsWith('https://huggingface.co/Qwen/') && m.url.endsWith('/' + m.file) && m.bytes > 5e8));
check('model ids are unique and resolvable', new Set(MODELS.map((m) => m.id)).size === MODELS.length && modelById(MODELS[0].id) === MODELS[0] && modelById('nope') === null);

if (failed) {
  console.log(`\n${failed} AI check(s) failed`);
  console.log(ctx);
  process.exit(1);
}
if (process.env.SHOW) console.log(ctx);
console.log('\nall AI checks passed');
