/**
 * Sends Sahm's exact Gemini request (same body and parser as the app) for each
 * Gemini model and prints what came back. Used by the AI eval workflow.
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
  for (const m of GEMINI_MODELS) {
    const t0 = Date.now();
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(interactionBody(m.id, messages, 700)),
    });
    const raw = await res.text();
    const r = parseInteractionSse(raw + '\n');
    console.log(`\n===== ${m.label} (${m.id}): HTTP ${res.status}, ${((Date.now() - t0) / 1000).toFixed(1)}s, done=${r.done}, error=${r.error}`);
    console.log(r.text || raw.slice(0, 800));
  }
}
main();
