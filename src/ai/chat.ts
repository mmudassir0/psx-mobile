/**
 * Context for free-form questions on the AI tab.
 *
 * The question decides what the model sees: stocks it names get a full data
 * pack (fetched live), a sector or "Shariah" narrows a screening table, and a
 * market snapshot is always included. Everything is computed here; the model
 * only reads.
 */
import type { IndexQuote, Stock, Candle } from '../psx/types';
import { fetchCompany } from '../psx/api';
import { cached, COMPANY_TTL } from '../psx/cache';
import { dailyCandles } from '../psx/history';
import { analyze, computeSeries } from '../analysis/signals';
import { backtest } from '../analysis/backtest';
import { valueStock } from '../analysis/valuation';
import { technicals } from '../analysis/technicals';
import { balanceSheetFor, computeRatios } from '../analysis/ratios';
import { StockPack, stockContext } from './context';
import { decide } from './verdict';

const GENERIC_NAME_WORDS = new Set(
  ('limited ltd company corporation pakistan industries the and bank banks cement power energy textile textiles mills ' +
    'oil gas sugar fertilizer fertilizers pharma pharmaceuticals insurance motors motor steel foods food chemical chemicals ' +
    'holdings holding group international investment investments securities technologies technology systems modaraba ' +
    'fund mutual services petroleum refinery national general first united global capital leasing').split(' '),
);

const COMMON_WORDS = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUY', 'SELL', 'PSX', 'KSE', 'ROE', 'ROA', 'EPS', 'PE', 'AI', 'IS', 'IT', 'OR', 'TOP', 'BEST', 'WITH', 'NOW', 'ALL']);

/** Lowercase words that are also tickers; typed in lowercase they are almost always plain English. */
const ENGLISH = new Set(
  ('power best good cheap bank banks stock stocks today which what about oil gas fast safe gold glass sugar steel cable ' +
    'top low high buy sell hold pace nice fine pak pakistan more most less news fund year week day and with for the are ' +
    'into over under than then this that from have has had can will should would could next last data price prices').split(' '),
);

const LEGAL = /\b(limited|ltd|company|co|corporation|corp|the|plc)\b/g;
const normName = (t: string) =>
  t.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();

/**
 * Stock symbols named in a question, in order, at most `max`.
 * Tickers count when typed in capitals, or in lowercase when they aren't an
 * ordinary word. Company names count on two of their words together
 * ("lucky cement", "hub power") or on a first word no other company shares.
 */
export function mentionedSymbols(question: string, stocks: Stock[], max = 3): string[] {
  const bySymbol = new Set(stocks.map((s) => s.symbol));
  const out: string[] = [];
  for (const tok of question.match(/[A-Za-z][A-Za-z0-9]{1,9}/g) ?? []) {
    const up = tok.toUpperCase();
    if (!bySymbol.has(up) || COMMON_WORDS.has(up) || out.includes(up)) continue;
    const caps = tok === up;
    if (caps || (tok.length >= 3 && !ENGLISH.has(tok.toLowerCase()))) out.push(up);
  }
  const q = ` ${normName(question)} `;
  const names = stocks.map((s) => ({ s, toks: normName(s.name).split(' ').filter(Boolean) }));
  const firstCount = new Map<string, number>();
  for (const n of names) if (n.toks[0]) firstCount.set(n.toks[0], (firstCount.get(n.toks[0]) ?? 0) + 1);
  // When several companies share the matched words ("fauji fertilizer"), the one whose whole name is closest wins.
  const best = new Map<string, { sym: string; len: number }>();
  for (const { s, toks } of names) {
    if (!toks.length) continue;
    const pair = toks.length >= 2 && q.includes(` ${toks[0]} ${toks[1]} `);
    const whole = q.includes(` ${toks.join(' ')} `) && (toks.length >= 2 || firstCount.get(toks[0]) === 1);
    const unique = toks[0].length >= 5 && firstCount.get(toks[0]) === 1 && !GENERIC_NAME_WORDS.has(toks[0]) && q.includes(` ${toks[0]} `);
    if (!pair && !whole && !unique) continue;
    const key = pair ? `${toks[0]} ${toks[1]}` : toks[0];
    const cur = best.get(key);
    if (!cur || toks.length < cur.len) best.set(key, { sym: s.symbol, len: toks.length });
  }
  for (const { sym } of best.values()) if (out.length < max && !out.includes(sym)) out.push(sym);
  return out.slice(0, max);
}

/** Words people use for a sector, most specific first, each pointing at part of PSX's sector name. */
const SECTOR_WORDS: [RegExp, RegExp][] = [
  [/investment bank|brokerage|broker|securities/, /inv\. banks/i],
  [/modaraba/, /modaraba/i],
  [/\bbanks?\b|banking/, /commercial banks/i],
  [/cement/, /cement/i],
  [/fertili[sz]er/, /fertili[sz]er/i],
  [/oil marketing|\bomc\b|petrol pump/, /oil & gas marketing/i],
  [/exploration|e&p|\boil\b|\bgas\b/, /oil & gas exploration/i],
  [/refiner/, /refinery/i],
  [/\bpower\b|electric|ipp/, /power generation/i],
  [/\btech|software|\bit\b/, /technology/i],
  [/pharma|medicine/, /pharmaceutical/i],
  [/\bauto|\bcars?\b|automobile/, /automobile assembler/i],
  [/textile/, /textile composite/i],
  [/food/, /food/i],
  [/steel|engineering/, /engineering/i],
  [/chemical/, /chemical/i],
  [/insurance/, /insurance/i],
];

/** The sector a question is about, if it names one. */
export function mentionedSector(question: string, stocks: Stock[]): string | null {
  const q = question.toLowerCase();
  const sectors = Array.from(new Set(stocks.map((s) => s.sector))).filter((s) => s && s !== 'Other');
  const exact = sectors.filter((sec) => q.includes(sec.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  if (exact) return exact;
  for (const [words, target] of SECTOR_WORDS) {
    if (!words.test(q)) continue;
    const hit = sectors.find((sec) => target.test(sec));
    if (hit) return hit;
  }
  return null;
}

/** ROE from bundled balance sheets: earnings = market cap ÷ P/E. */
function roeOf(s: Stock): number | null {
  const bs = balanceSheetFor(s.symbol);
  if (!bs || !s.marketCap || !s.pe || s.pe <= 0 || bs.equity <= 0) return null;
  return s.marketCap / s.pe / bs.equity;
}

const f = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(d));

/** The stocks a question is about: its sector and Shariah filter, if any. */
function universe(question: string, stocks: Stock[]): { rows: Stock[]; sector: string | null; shariah: boolean } {
  const q = question.toLowerCase();
  let rows = stocks.filter((s) => s.price != null && (s.marketCap ?? 0) > 0);
  const sector = mentionedSector(question, stocks);
  if (sector) rows = rows.filter((s) => s.sector === sector);
  const shariah = /shariah|islamic|halal/.test(q);
  if (shariah) rows = rows.filter((s) => s.shariah);
  return { rows, sector, shariah };
}

interface Measure {
  test: RegExp;
  label: string;
  value: (s: Stock) => number | null;
  /** true = highest first */
  desc: boolean;
  unit: string;
  note?: string;
}

const MEASURES: Measure[] = [
  { test: /cheap|undervalued|\bvalue\b|low p\/?e|bargain/, label: 'P/E, lowest first (cheapest valuation)', value: (s) => (s.pe != null && s.pe > 0 ? s.pe : null), desc: false, unit: '×', note: 'Loss-making companies have no P/E and are left out.' },
  { test: /expensive|overvalued|high p\/?e/, label: 'P/E, highest first (richest valuation)', value: (s) => (s.pe != null && s.pe > 0 ? s.pe : null), desc: true, unit: '×' },
  { test: /dividend|yield|payout|income/, label: 'dividend yield, highest first', value: (s) => s.divYield ?? null, desc: true, unit: '%' },
  { test: /\broe\b|return on equity|most profitable|quality/, label: 'return on equity, highest first', value: (s) => { const r = roeOf(s); return r == null ? null : r * 100; }, desc: true, unit: '%', note: 'Only companies whose balance sheet Sahm has read.' },
  { test: /los(er|ing)|fell|down today|worst/, label: "today's change, biggest fall first", value: (s) => (s.volume ?? 0) > 0 ? s.changePct ?? null : null, desc: false, unit: '%' },
  { test: /gain|rose|up today|best perform|top perform|movers/, label: "today's change, biggest rise first", value: (s) => (s.volume ?? 0) > 0 ? s.changePct ?? null : null, desc: true, unit: '%' },
  { test: /(1|one)[ -]?y(ea)?r|past year|this year|annual return/, label: '1-year change, best first', value: (s) => s.change1y ?? null, desc: true, unit: '%' },
  { test: /largest|biggest|market cap/, label: 'market value, largest first', value: (s) => (s.marketCap ? s.marketCap / 1e9 : null), desc: true, unit: 'B' },
];

/** A ranking computed in code when the question asks for best / cheapest / highest. */
export function ranking(question: string, stocks: Stock[], top = 6): string | null {
  const q = question.toLowerCase();
  const m = MEASURES.find((x) => x.test.test(q));
  if (!m) return null;
  const { rows, sector, shariah } = universe(question, stocks);
  const ranked = rows
    .map((s) => ({ s, v: m.value(s) }))
    .filter((x): x is { s: Stock; v: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => (m.desc ? b.v - a.v : a.v - b.v))
    .slice(0, top);
  if (!ranked.length) return null;
  const scope = `${shariah ? 'Shariah ' : ''}${sector ? sector + ' ' : ''}stocks`;
  return [
    `RANKING (computed by Sahm; use it as the answer's backbone): ${scope} by ${m.label}.`,
    ...ranked.map((x, i) => `${i + 1}. ${x.s.symbol} (${x.s.name}): ${x.v.toFixed(1)}${m.unit}`),
    m.note ?? '',
  ].filter(Boolean).join('\n');
}

export function screeningTable(question: string, stocks: Stock[], limit = 30): string {
  const u = universe(question, stocks);
  const sector = u.sector;
  const rows = u.rows.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, limit);
  const head = 'symbol | sector | price | today % | 1y % | P/E | div yield % | ROE % | shariah';
  const lines = rows.map((s) => {
    const roe = roeOf(s);
    return [s.symbol, s.sector, f(s.price, 2), f(s.changePct), f(s.change1y), s.pe != null && s.pe > 0 ? f(s.pe) : '-', f(s.divYield), roe == null ? '-' : f(roe * 100), s.shariah ? 'yes' : 'no'].join(' | ');
  });
  const title = `STOCKS${sector ? ` IN ${sector.toUpperCase()}` : ''}${u.shariah ? ' (SHARIAH ONLY)' : ''}, LARGEST ${rows.length} BY MARKET CAP`;
  return [title, "('-' = not available; a missing P/E usually means the company made a loss)", head, ...lines].join('\n');
}

export function marketSnapshot(stocks: Stock[], indices: IndexQuote[]): string {
  const traded = stocks.filter((s) => (s.volume ?? 0) > 0 && s.changePct != null);
  const up = traded.filter((s) => (s.changePct as number) > 0).length;
  const down = traded.filter((s) => (s.changePct as number) < 0).length;
  const liquid = traded.filter((s) => (s.volume ?? 0) >= 100_000);
  const gain = [...liquid].sort((a, b) => (b.changePct as number) - (a.changePct as number)).slice(0, 5);
  const lose = [...liquid].sort((a, b) => (a.changePct as number) - (b.changePct as number)).slice(0, 5);
  const idx = indices
    .filter((i) => ['KSE100', 'KMI30', 'ALLSHR'].includes(i.code))
    .map((i) => `${i.code} ${f(i.current, 0)} (${f(i.changePct, 2)}%)`)
    .join(', ');
  return [
    `MARKET TODAY: ${idx || 'index data n/a'}. ${up} stocks up, ${down} down.`,
    `Top gainers: ${gain.map((s) => `${s.symbol} ${f(s.changePct)}%`).join(', ') || 'n/a'}.`,
    `Top losers: ${lose.map((s) => `${s.symbol} ${f(s.changePct)}%`).join(', ') || 'n/a'}.`,
  ].join('\n');
}

/** Data pack inputs for one symbol, fetched live. */
export async function packOf(symbol: string, stocks: Stock[]): Promise<StockPack> {
  const stock = stocks.find((s) => s.symbol === symbol);
  const [company, daily] = await Promise.all([
    cached(`company:${symbol}`, COMPANY_TTL, () => fetchCompany(symbol), { persist: true }).catch(() => null),
    dailyCandles(symbol).catch(() => [] as Candle[]),
  ]);
  const balance = balanceSheetFor(symbol);
  const peers = stock ? stocks.filter((s) => s.sector === stock.sector && s.symbol !== symbol).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) : [];
  const series = daily.length ? computeSeries(daily) : null;
  const ratios = computeRatios(balance, company, stock);
  return {
    stock,
    company,
    analysis: series ? analyze(daily, series) : null,
    tech: daily.length ? technicals(daily) : null,
    backtest: series ? backtest(daily, series) : null,
    fair: company ? valueStock({ symbol, stock, company, ratios, balance, peers, daily }) : null,
    ratios,
    balance,
    peers,
    today: new Date().toISOString().slice(0, 10),
  };
}

/** Side-by-side table for comparison questions, with the rule-based verdict for each. ★ marks the better value. */
export function comparison(packs: StockPack[]): string {
  const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
  // [label, value, decimals, which is better]
  const rows: [string, (p: StockPack) => number | null, number, 'high' | 'low' | null][] = [
    ['price Rs', (p) => num(p.stock?.price ?? p.company?.close), 2, null],
    ['today %', (p) => num(p.stock?.changePct ?? p.company?.changePct), 1, 'high'],
    ['1-year %', (p) => num(p.company?.change1y ?? p.stock?.change1y), 1, 'high'],
    ['P/E (lower = cheaper)', (p) => { const v = p.company?.pe ?? p.stock?.pe; return v != null && v > 0 ? v : null; }, 1, 'low'],
    ['dividend yield %', (p) => num(p.stock?.divYield), 1, 'high'],
    ['ROE %', (p) => (p.balance && p.ratios?.roe != null ? p.ratios.roe * 100 : null), 1, 'high'],
    ['EPS growth %', (p) => num(p.company?.ratios?.rows.find((r) => /eps growth/i.test(r.label))?.values[0]), 1, 'high'],
    ['market cap Rs B', (p) => num((p.company?.marketCap ?? p.stock?.marketCap ?? NaN) / 1e9), 0, null],
    ['technical score /10', (p) => num(p.analysis?.score), 1, 'high'],
  ];
  const syms = packs.map((p) => p.stock?.symbol ?? p.company?.symbol ?? '?');
  const lines = rows.map(([label, get, d, better]) => {
    const vals = packs.map(get);
    const known = vals.filter((v): v is number => v != null);
    const target = better && known.length > 1 && new Set(known).size > 1 ? (better === 'high' ? Math.max(...known) : Math.min(...known)) : null;
    return `${label} | ${vals.map((v) => (v == null ? '-' : v.toFixed(d) + (v === target ? ' ★' : ''))).join(' | ')}`;
  });
  const verdicts = packs.map((p) => { const v = decide(p); return v ? `${v.call} (${v.confidence})` : '-'; });
  return [
    'COMPARISON (computed by Sahm; base the answer on it. ★ marks the better value in each row)',
    `measure | ${syms.join(' | ')}`,
    ...lines,
    `Sahm verdict | ${verdicts.join(' | ')}`,
  ].join('\n');
}

/** Everything the model sees for one question, in a full and a compact (on-phone) version. */
export async function chatContext(
  question: string,
  stocks: Stock[],
  indices: IndexQuote[],
): Promise<{ text: string; compact: string; symbols: string[] }> {
  const symbols = mentionedSymbols(question, stocks);
  const packs = await Promise.all(symbols.map((sym) => packOf(sym, stocks)));
  const rank = symbols.length < 2 ? ranking(question, stocks) : null;
  const head = [marketSnapshot(stocks, indices)];
  if (packs.length >= 2) head.push(comparison(packs));
  if (rank) head.push(rank);
  const table = symbols.length < 2 ? [screeningTable(question, stocks, symbols.length ? 15 : 30)] : [];
  const full = [...head, ...packs.map((p) => stockContext(p)), ...table];
  // Phone models: the computed ranking or comparison plus slim packs; the big table only when nothing was ranked.
  const compact = [...head, ...packs.map((p) => stockContext(p, true)), ...(rank || packs.length >= 2 ? [] : [screeningTable(question, stocks, 15)])];
  return { text: full.join('\n\n'), compact: compact.join('\n\n'), symbols };
}
