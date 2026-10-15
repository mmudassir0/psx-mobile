import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseCompany, parseHistorical, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard } from '../src/psx/parse';
import { mergeStocks } from '../src/psx/merge';
import { analyze } from '../src/analysis/signals';
import { technicals } from '../src/analysis/technicals';
import { computeRatios } from '../src/analysis/ratios';
import { analysisMessages, median, stockContext } from '../src/ai/context';
import { comparison, mentionedSector, mentionedSymbols, ranking, screeningTable } from '../src/ai/chat';
import { MODELS, modelById } from '../src/ai/models';
import { decide, fundamentalPoints, verdictText } from '../src/ai/verdict';
import { parseSse } from '../src/ai/cloud';
import { BalanceSheet } from '../src/analysis/ratios';

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
const pack = { stock: luck, company, analysis: analyze(daily), tech: technicals(daily), ratios: computeRatios(null, company, luck), balance: null, peers, today: '2026-10-14' };
const v = decide(pack)!;
check('verdict decided', !!v && ['Bullish', 'Neutral', 'Bearish'].includes(v.call), v && { call: v.call, conf: v.confidence, combined: v.combined });
check('LUCK is bearish: strong bearish technicals outweigh fundamentals', v.call === 'Bearish' && v.combined <= 4, v.combined);
check('bearish verdict avoids new buys and gives a holders stop below price', v.levels?.kind === 'avoid' && (v.levels.stop as number) < 405.38 && v.levels.trigger === v.levels.trigger, v.levels);
const fp = fundamentalPoints(pack);
check('fundamentals see EPS growth and premium P/E', fp.bull.some((p) => /grew 40.9%/.test(p.text)) && fp.bear.some((p) => /above the sector median/.test(p.text)), [fp.bull.map((p) => p.text), fp.bear.map((p) => p.text)]);
check('flat quarter (9.21 vs 9.22 a year earlier) adds no point', [...fp.bull, ...fp.bear].every((p) => !/Q3 2026 EPS/.test(p.text)));
const bs: BalanceSheet = { periodEnd: '2026-06-30', statement: 'standalone', isBank: false, equity: 216_641_607_000, assets: 301_409_878_000, liabilities: 84_768_271_000, currentAssets: 127_042_576_000, currentLiabilities: 53_105_221_000, borrowings: 18_772_011_000, cash: 1_530_592_000, source: { title: 'x', url: 'x', date: '2026-09-04', pages: [236] } };
const withBs = { ...pack, balance: bs, ratios: computeRatios(bs, company, luck) };
const fp2 = fundamentalPoints(withBs);
check('balance sheet adds ROE and low debt', fp2.bull.some((p) => /Return on equity/.test(p.text)) && fp2.bull.some((p) => /Low debt/.test(p.text)), fp2.bull.map((p) => p.text));
// A rising stock with a cheap valuation should come out bullish with buy levels in order.
const up = Array.from({ length: 260 }, (_, i) => ({ t: i * 864e5, o: 100 + i * 0.5, h: 101 + i * 0.5 + (i % 5), l: 99 + i * 0.5 - (i % 4), c: 100 + i * 0.5 + (i % 3), v: 1e5 + i }));
const bullPack = { ...pack, analysis: analyze(up), tech: technicals(up) };
const bv = decide(bullPack)!;
check('uptrend gives a bullish or neutral call', bv.call !== 'Bearish', { call: bv.call, combined: bv.combined });
if (bv.levels?.kind === 'buy') {
  const l = bv.levels;
  check('buy levels are ordered stop < entry <= price < target', (l.stop as number) < (l.entryLow as number) && (l.entryLow as number) <= (l.entryHigh as number) && (l.entryHigh as number) <= bullPack.analysis!.ind.close + 1e-9 && (l.target as number) > bullPack.analysis!.ind.close, l);
}
const vt = verdictText(v);
check('conflict only when the two sides point opposite ways', v.headline.includes('conflict') === (v.technical!.score <= 4 && (v.fundamental?.score ?? 5) >= 6) || v.headline.includes('conflict') === (v.technical!.score >= 6 && (v.fundamental?.score ?? 5) <= 4), v.headline);
check('no conflict wording when fundamentals are only fair', bv.fundamental?.label !== 'Fair' || !bv.headline.includes('conflict'), bv.headline);
check('verdict text states call and levels', vt.includes('Bearish') && vt.includes("holders' stop") && !/NaN|undefined/.test(vt), vt);
const msgs = analysisMessages(ctx, vt, v.call, 'small');
check('small prompt asks to explain, not decide', msgs.length === 2 && msgs[0].content.includes('**Why bearish:**') && msgs[1].content.startsWith('SAHM VERDICT'));
check('large prompt adds a second opinion line', analysisMessages(ctx, vt, v.call, 'large')[0].content.includes('Second opinion'));
const sse = parseSse('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\ndata: [DONE]\ndata: {"choi');
check('SSE parser reads deltas and keeps the partial line', sse.text === 'Hello' && sse.done && sse.rest === 'data: {"choi', sse);
check('median', median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5 && median([]) === null);

check('finds tickers', JSON.stringify(mentionedSymbols('compare LUCK and DGKC', stocks)) === '["LUCK","DGKC"]', mentionedSymbols('compare LUCK and DGKC', stocks));
check('ignores common words', !mentionedSymbols('IS IT A BUY NOW', stocks).length, mentionedSymbols('IS IT A BUY NOW', stocks));
check('generic words in a question match no company', mentionedSymbols('Shariah banks with the best dividend yield', stocks).length === 0, mentionedSymbols('Shariah banks with the best dividend yield', stocks));
check('distinctive names still match', mentionedSymbols('is meezan bank a buy?', stocks).includes('MEBL'), mentionedSymbols('is meezan bank a buy?', stocks));
for (const [q, want] of [['what about lucky cement?', ['LUCK']], ['compare engro and fauji fertilizer', ['ENGRO', 'FFC']], ['best power stocks', []], ['How is hub power doing', ['HUBC']], ['systems limited outlook', ['SYS']], ['ogdc vs ppl', ['OGDC', 'PPL']]] as [string, string[]][]) {
  const got = mentionedSymbols(q, stocks);
  check(`question "${q}" finds ${want.join(', ') || 'no stock'}`, JSON.stringify(got) === JSON.stringify(want), got);
}
check('finds company names', mentionedSymbols('what about lucky cement?', stocks).includes('LUCK'), mentionedSymbols('what about lucky cement?', stocks));
const bankSector = mentionedSector('best bank stocks for dividends', stocks);
check('finds a sector', !!bankSector && /bank/i.test(bankSector), bankSector);
const table = screeningTable('shariah cement stocks', stocks);
check('screening filters sector and Shariah', table.includes('CEMENT') && table.includes('SHARIAH ONLY') && !table.split('\n').slice(3).some((l) => l.endsWith('| no')), table.split('\n').slice(0, 3));
const dcl = screeningTable('cement stocks', stocks).split('\n').find((l) => l.startsWith('DCL |'));
check('loss-makers show no P/E, not 0', !!dcl && dcl.split(' | ')[5] === '-', dcl);

const cheap = ranking('Which cement stock looks cheapest?', stocks)!;
check('cheapest cement is ranked by P/E, lowest first', !!cheap && cheap.split('\n')[1].startsWith('1. THCCL') && cheap.includes('P/E, lowest first'), cheap?.split('\n').slice(0, 3));
check('ranking skips loss-makers', !/DCL \(/.test(cheap));
const divi = ranking('Shariah banks with the best dividend yield', stocks)!;
check('dividend ranking is Shariah banks only, highest first', !!divi && /Shariah .*Bank/i.test(divi) && Number(divi.split('\n')[1].match(/: ([\d.]+)%/)![1]) >= Number(divi.split('\n')[2].match(/: ([\d.]+)%/)![1]), divi?.split('\n').slice(0, 3));
check('no ranking for a plain question', ranking('What is LUCK?', stocks) === null);
const cmp = comparison([pack, { ...pack, stock: stocks.find((x) => x.symbol === 'DGKC'), company: null, analysis: null, tech: null, balance: null, ratios: null }]);
check('comparison lists both symbols with a verdict row', cmp.includes('measure | LUCK | DGKC') && /Sahm verdict \| Bearish/.test(cmp) && !/NaN|undefined/.test(cmp), cmp);
check('comparison stars the better 1-year return and the lower P/E', /1-year % \| -10\.1 ★ \| -23\.5$/m.test(cmp) && /P\/E \(lower = cheaper\) \| 12\.7 \| 7\.1 ★$/m.test(cmp), cmp.split('\n').slice(2, 6));
const compactCtx = stockContext(pack, true);
check('compact pack is much smaller and keeps the essentials', compactCtx.length < ctx.length * 0.7 && compactCtx.includes('TECHNICAL SCORE') && compactCtx.includes('Valuation:'), [compactCtx.length, ctx.length]);
check('model catalog points at Qwen GGUF files on Hugging Face', MODELS.every((m) => /^https:\/\/huggingface.co\/(Qwen|unsloth)\/Qwen/.test(m.url) && m.url.endsWith('/' + m.file) && m.bytes > 5e8));
check('model ids are unique and resolvable', new Set(MODELS.map((m) => m.id)).size === MODELS.length && modelById(MODELS[0].id) === MODELS[0] && modelById('nope') === null);

if (failed) {
  console.log(`\n${failed} AI check(s) failed`);
  console.log(ctx);
  process.exit(1);
}
if (process.env.SHOW) console.log(ctx);
console.log('\nall AI checks passed');
