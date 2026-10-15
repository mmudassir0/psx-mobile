/**
 * Sends Sahm's exact Gemini request (same body and parser as the app) for each
 * Gemini model and prints what came back, with timings. Used by the AI eval workflow.
 *   GEMINI_KEY=... tsx scripts/gemini-check.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { GEMINI_MODELS, GEMINI_URL, interactionBody, parseInteractionSse } from '../src/ai/gemini';
import { adjustCandles, parseCompany, parseHistorical, parseScreener, parseSymbols, parseTimeseries, parseTradingBoard } from '../src/psx/parse';
import { mergeStocks } from '../src/psx/merge';
import { analyze } from '../src/analysis/signals';
import { technicals } from '../src/analysis/technicals';
import { computeRatios } from '../src/analysis/ratios';
import { analysisMessages, stockContext } from '../src/ai/context';
import { decide, verdictText } from '../src/ai/verdict';

const f = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');

async function call(key: string, label: string, body: object) {
  const t0 = Date.now();
  const s = () => ((Date.now() - t0) / 1000).toFixed(1);
  const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const head = s();
  let raw = '', firstByte = '', firstText = '';
  const types = new Map<string, number>();
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstByte) firstByte = s();
    const chunk = dec.decode(value, { stream: true });
    raw += chunk;
    for (const m of chunk.matchAll(/"event_type":"([^"]+)"/g)) types.set(m[1], (types.get(m[1]) ?? 0) + 1);
    if (!firstText && /"type":"text"/.test(chunk)) firstText = s();
  }
  const r = parseInteractionSse(raw + '\n');
  console.log(`\n===== ${label}: HTTP ${res.status} headers ${head}s, first byte ${firstByte}s, first text ${firstText || '-'}s, total ${s()}s, ${r.text.length} chars, error=${r.error}`);
  console.log('events:', JSON.stringify(Object.fromEntries(types)));
  const usage = raw.match(/"usage":\{[^}]*\}/g);
  if (usage) console.log('usage:', usage[usage.length - 1]);
  return { r, raw };
}

async function main() {
  const key = process.env.GEMINI_KEY;
  if (!key) return console.log('No GEMINI_KEY secret: skipped');
  const stocks = mergeStocks(parseSymbols(JSON.parse(f('symbols.json'))), parseScreener(f('screener.html')), parseTradingBoard(f('board.html')));
  const stock = stocks.find((s) => s.symbol === 'LUCK');
  const company = parseCompany('LUCK', f('company_LUCK.html'));
  const daily = adjustCandles(parseHistorical(f('historical_LUCK.html')), parseTimeseries(JSON.parse(f('eod_LUCK.json'))));
  const pack = { stock, company, analysis: analyze(daily), tech: technicals(daily), ratios: computeRatios(null, company, stock), balance: null, peers: stocks.filter((s) => s.sector === 'Cement' && s.symbol !== 'LUCK'), today: '2026-10-15' };
  const v = decide(pack)!;
  const messages = analysisMessages(stockContext(pack), verdictText(v), v.call, 'large');
  console.log('prompt chars:', messages.reduce((n, m) => n + m.content.length, 0));

  // The app's exact request, three times, to see the spread.
  for (let i = 1; i <= 3; i++) {
    const { r, raw } = await call(key, `Flash, app request #${i}`, interactionBody(GEMINI_MODELS[0].id, messages, 700));
    if (i === 1) console.log(r.text || raw.slice(0, 800));
  }
  // Variants, to choose settings.
  const base = interactionBody(GEMINI_MODELS[0].id, messages, 700) as any;
  await call(key, 'Flash, thinking minimal', { ...base, generation_config: { ...base.generation_config, thinking_level: 'minimal' } });
  await call(key, 'Flash, no generation_config', { ...base, generation_config: undefined });
  await call(key, 'Flash, tiny prompt', interactionBody(GEMINI_MODELS[0].id, [{ role: 'user', content: 'Reply with the single word OK.' }], 16));
  for (const m of GEMINI_MODELS.slice(1)) {
    const { r, raw } = await call(key, m.label, interactionBody(m.id, messages, 700));
    if (!r.text) console.log(raw.slice(0, 400));
  }
}
main();
