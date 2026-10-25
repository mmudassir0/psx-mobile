import { readFileSync } from 'fs';
import { join } from 'path';
import { adjustCandles, parseCompany, parseHistorical, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard } from '../src/psx/parse';
import { mergeStocks } from '../src/psx/merge';
import { analyze } from '../src/analysis/signals';
import { technicals } from '../src/analysis/technicals';
import { computeRatios } from '../src/analysis/ratios';
import { analysisMessages, median, stockContext } from '../src/ai/context';
import { comparison, mentionedSector, mentionedSymbols, ranking, screeningTable } from '../src/ai/chat';
import { decide, fundamentalPoints, verdictText } from '../src/ai/verdict';
import { chain, parseSse, CloudError } from '../src/ai/cloud';
import { geminiWithRetry, parseInteractionSse, testGeminiKey, toInteraction } from '../src/ai/gemini';
import { sharePrompt } from '../src/ai/sharePrompt';
import { backtest, Backtest } from '../src/analysis/backtest';
import { valueStock } from '../src/analysis/valuation';
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
check('pack carries the signal score', ctx.includes('TECHNICAL SCORE 2.7/10 (Bearish)'));
check('pack carries annual EPS', ctx.includes('EPS 31.83'));
check('pack says when no balance sheet', ctx.includes('No balance sheet available'));
check('pack lists announcements', ctx.includes('RECENT ANNOUNCEMENTS'));
check('pack has no NaN or undefined', !/NaN|undefined|Infinity/.test(ctx), ctx.match(/.{30}(NaN|undefined|Infinity).{10}/)?.[0]);
check('pack fits a small model (< 6,000 chars)', ctx.length < 6000, ctx.length);
const pack = { stock: luck, company, analysis: analyze(daily), tech: technicals(daily), ratios: computeRatios(null, company, luck), balance: null, peers, today: '2026-10-14' };
const v = decide(pack)!;

// Track record: LUCK's bearish technical reading has had an edge, so it is shown and passed to the AI.
const bt = backtest(daily)!;
const withBt = { ...pack, backtest: bt };
const vb = decide(withBt)!;
check('verdict carries the track record', vb.record?.group === 'bearish' && vb.record.days > 100, vb.record);
check('track record reaches the AI', stockContext(withBt).includes('TRACK RECORD') && stockContext(withBt, true).includes('TRACK RECORD') && verdictText(vb).includes('Track record:'));
check('a good record never raises confidence', vb.confidence === v.confidence, [vb.confidence, v.confidence]);
const fair = valueStock({ symbol: 'LUCK', stock: luck, company, ratios: pack.ratios, balance: null, peers, daily })!;
const vf = decide({ ...pack, fair })!;
check('fair value is estimated for LUCK from P/E methods', fair.methods.length === 2 && fair.label === 'Overvalued', fair.methods.map((m) => [m.id, Math.round(m.value)]));
check('fair value replaces the plain P/E point in the verdict', vf.bear.some((p) => /fair value midpoint/.test(p.text)) && !vf.bear.some((p) => /above the sector median/.test(p.text)));
check('fair value reaches the AI', stockContext({ ...pack, fair }).includes('FAIR VALUE') && stockContext({ ...pack, fair }, true).includes('FAIR VALUE'));
const thinV = decide({ ...pack, analysis: { ...pack.analysis!, liquidity: 1.2e6 } })!;
check('thinly traded stocks get low confidence and a warning', thinV.confidence === 'Low' && /Thinly traded \(about Rs 1\.2M a day\)/.test(thinV.headline), thinV.headline);
check('liquid LUCK has no thin-trading warning', !/Thinly/.test(v.headline) && ctx.includes('Liquidity: median daily traded value'));
// Same stock with a record where bearish readings were followed by rises: confidence drops.
const flipped: Backtest = { ...bt, groups: { ...bt.groups, bearish: { ...bt.groups.bearish, 10: { days: 500, up: 0.62, avg: 0.02 } } } };
const vw = decide({ ...pack, backtest: flipped })!;
const order = ['Low', 'Medium', 'High'];
check('a poor record lowers confidence', v.confidence === 'Low' ? vw.confidence === 'Low' : order.indexOf(vw.confidence) === order.indexOf(v.confidence) - 1, [v.confidence, vw.confidence, vw.record?.edge]);
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

const g = parseInteractionSse('event: step.delta\ndata: {"index":0,"delta":{"type":"text","text":"Hel"},"event_type":"step.delta"}\n\nevent: step.delta\ndata: {"index":0,"delta":{"type":"thought_summary","text":"x"},"event_type":"step.delta"}\ndata: {"index":0,"delta":{"type":"text","text":"lo"},"event_type":"step.delta"}\ndata: {"interaction":{"status":"completed"},"event_type":"interaction.completed"}\ndata: [DONE]\ndata: {"inde');
check('Gemini stream: text deltas only, no thoughts, keeps partial line', g.text === 'Hello' && g.done && g.rest === 'data: {"inde' && !g.error, g);
check('Gemini stream reports errors', parseInteractionSse('data: {"error":{"message":"quota","code":"x"},"event_type":"error"}\n').error === 'quota');
const ti = toInteraction([{ role: 'system', content: 'S' }, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }]);
check('Gemini input folds earlier turns', ti.system === 'S' && ti.input.includes('Earlier question: q1') && ti.input.includes('Your earlier answer: a1') && ti.input.endsWith('New question: q2'), ti);
const sp = sharePrompt(analysisMessages(ctx, vt, v.call, 'large'));
check('share prompt is self-contained', sp.includes('INSTRUCTIONS') && sp.includes('SAHM VERDICT') && sp.includes('STOCK LUCK') && sp.length < 12000, sp.length);

// Fallback chain: first provider rate-limited, second answers.
const fake = (out: string | Error) => ({ label: String(out), start: (cb: (t: string) => void) => ({ done: out instanceof Error ? Promise.reject(out) : Promise.resolve(out).then((t) => (cb(t), t)), stop: () => {} }) });
const labels: string[] = [];
chain([fake(new CloudError('limit', 429)), fake('second')], () => {}, (l) => labels.push(l)).done.then((t) => {
  check('chain falls back on rate limit', t === 'second' && labels.length === 2, { t, labels });
  return chain([fake(new CloudError('bad key', 401)), fake('never')], () => {}).done.then(
    () => check('chain stops on a bad key', false),
    (e) => check('chain stops on a bad key', (e as Error).message === 'bad key'),
  );
}).then(async () => {
  // Gemini over a fake XMLHttpRequest that replays queued responses.
  const queue: { status: number; body: string }[] = [];
  let sent = 0;
  (globalThis as any).XMLHttpRequest = class {
    status = 0; responseText = ''; timeout = 0;
    onprogress?: () => void; onload?: () => void; onerror?: () => void; onabort?: () => void;
    open() {} setRequestHeader() {}
    abort() { this.onabort?.(); }
    send() {
      sent++;
      const r = queue.shift() ?? { status: 0, body: '' };
      setTimeout(() => {
        if (!r.status) return this.onerror?.();
        this.status = r.status; this.responseText = r.body; this.onload?.();
      }, 1);
    }
  };
  const ok = 'data: {"delta":{"type":"text","text":"Fine"},"event_type":"step.delta"}\ndata: {"event_type":"interaction.completed"}\n';
  const busy503 = '{"error":{"message":"high demand","code":"service_unavailable"}}';
  queue.push({ status: 503, body: busy503 }, { status: 200, body: ok });
  const t1 = await geminiWithRetry('k', 'm', [{ role: 'user', content: 'q' }], () => {}, 10, 5).done;
  check('Gemini retries once after "high demand"', t1 === 'Fine' && sent === 2, { t1, sent });
  queue.push({ status: 503, body: busy503 }, { status: 503, body: busy503 });
  check('a key Google accepted while busy is kept', (await testGeminiKey('k')) === 'busy');
  queue.push({ status: 400, body: '{"error":{"message":"API key not valid"}}' });
  const bad = await testGeminiKey('k').then(() => '', (e) => (e as Error).message);
  check('a refused key is reported', /rejected/.test(bad), bad);
}).then(() => {
  if (failed) {
    console.log(`\n${failed} AI check(s) failed`);
    process.exit(1);
  }
  console.log('\nall AI checks passed');
});
if (process.env.SHOW) console.log(ctx);
