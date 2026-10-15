/**
 * Runs Sahm's real AI prompts against OpenAI-compatible endpoints so answer
 * quality can be compared across models. Used by the AI eval workflow.
 *   tsx scripts/ai-eval.ts out.json
 * Env: EVAL_TARGETS = JSON list of {name, url, model, key?, tier}
 */
import { writeFileSync } from 'fs';
import { fetchBoard, fetchScreener, fetchSymbols, fetchIndices, fetchCompany, fetchDailyCandles } from '../src/psx/api';
import { mergeStocks } from '../src/psx/merge';
import { analyze } from '../src/analysis/signals';
import { technicals } from '../src/analysis/technicals';
import { balanceSheetFor, computeRatios } from '../src/analysis/ratios';
import { analysisMessages, CHAT_SYSTEM, StockPack, stockContext, Tier } from '../src/ai/context';
import { decide, verdictText } from '../src/ai/verdict';
import { chatContext } from '../src/ai/chat';

interface Target {
  name: string;
  url: string;
  model: string;
  key?: string;
  tier: Tier;
}

const SYMBOLS = ['LUCK', 'MEBL', 'OGDC', 'SYS', 'EFERT'];
const QUESTIONS = ['Which cement stock looks cheapest?', 'Compare LUCK and DGKC'];

async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw last;
}

async function ask(t: Target, messages: { role: string; content: string }[], maxTokens: number) {
  const started = Date.now();
  const body: Record<string, unknown> = { model: t.model, messages, temperature: t.tier === 'large' ? 0.3 : 0.2, max_tokens: maxTokens };
  if (t.model.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = 'low';
    body.include_reasoning = false;
    body.max_tokens = maxTokens + 1200;
  }
  if (t.tier === 'small') Object.assign(body, { top_p: 0.9, repeat_penalty: 1.1 });
  for (let i = 0; i < 6; i++) {
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t.key ? { Authorization: `Bearer ${t.key}` } : {}) },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    const j = (await res.json()) as any;
    if (!res.ok) return { error: `${res.status} ${JSON.stringify(j).slice(0, 300)}`, ms: Date.now() - started };
    return {
      text: j.choices?.[0]?.message?.content ?? '',
      ms: Date.now() - started,
      usage: j.usage,
      timings: j.timings, // llama-server reports prompt/predict speed
    };
  }
  return { error: 'rate limited', ms: Date.now() - started };
}

async function main() {
  const targets: Target[] = JSON.parse(process.env.EVAL_TARGETS || '[]');
  const [symbols, screener, board, indices] = await Promise.all([
    retry(fetchSymbols),
    retry(fetchScreener),
    retry(fetchBoard).catch(() => []),
    retry(fetchIndices).catch(() => []),
  ]);
  const stocks = mergeStocks(symbols, screener, board);
  const cases: { id: string; kind: string; msgs: Record<Tier, { role: string; content: string }[]>; verdict?: string }[] = [];

  for (const sym of SYMBOLS) {
    const stock = stocks.find((s) => s.symbol === sym);
    const [company, daily] = await Promise.all([retry(() => fetchCompany(sym)), retry(() => fetchDailyCandles(sym))]);
    const balance = balanceSheetFor(sym);
    const pack: StockPack = {
      stock,
      company,
      analysis: analyze(daily),
      tech: technicals(daily),
      ratios: computeRatios(balance, company, stock),
      balance,
      peers: stock ? stocks.filter((s) => s.sector === stock.sector && s.symbol !== sym).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) : [],
      today: new Date().toISOString().slice(0, 10),
    };
    const ctx = stockContext(pack);
    const v = decide(pack);
    if (!v) continue;
    const vt = verdictText(v);
    cases.push({
      id: sym,
      kind: 'explain',
      verdict: vt,
      msgs: { small: analysisMessages(ctx, vt, v.call, 'small'), large: analysisMessages(ctx, vt, v.call, 'large') },
    });
  }
  for (const q of QUESTIONS) {
    const { text } = await chatContext(q, stocks, indices);
    const m = [
      { role: 'system', content: `${CHAT_SYSTEM}\n----------\n${text}` },
      { role: 'user', content: q },
    ];
    cases.push({ id: q, kind: 'chat', msgs: { small: m, large: m } });
  }

  const results: unknown[] = [];
  for (const t of targets) {
    for (const c of cases) {
      const r = await ask(t, c.msgs[t.tier], c.kind === 'chat' ? 500 : 450);
      results.push({ target: t.name, tier: t.tier, case: c.id, kind: c.kind, verdict: c.verdict, ...r });
      console.log(`${t.name} · ${c.id}: ${'error' in r && r.error ? r.error : `${(r.ms / 1000).toFixed(1)}s`}`);
      if (t.key) await new Promise((r) => setTimeout(r, 4000));
    }
  }
  writeFileSync(process.argv[2], JSON.stringify({ when: new Date().toISOString(), cases: cases.map((c) => ({ id: c.id, kind: c.kind, prompt: c.msgs.small })), results }, null, 1));
}

main();
