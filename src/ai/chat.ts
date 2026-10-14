/**
 * Context for free-form questions on the AI tab.
 *
 * The question decides what the model sees: stocks it names get a full data
 * pack (fetched live), a sector or "Shariah" narrows a screening table, and a
 * market snapshot is always included. Everything is computed here; the model
 * only reads.
 */
import type { IndexQuote, Stock } from '../psx/types';
import { fetchCompany, fetchDailyCandles } from '../psx/api';
import { analyze } from '../analysis/signals';
import { technicals } from '../analysis/technicals';
import { balanceSheetFor, computeRatios } from '../analysis/ratios';
import { stockContext } from './context';

const COMMON_WORDS = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUY', 'SELL', 'PSX', 'KSE', 'ROE', 'ROA', 'EPS', 'PE', 'AI', 'IS', 'IT', 'OR', 'TOP', 'BEST', 'WITH', 'NOW', 'ALL']);

/** Stock symbols named in a question, in order, at most `max`. Matches tickers and distinctive company names. */
export function mentionedSymbols(question: string, stocks: Stock[], max = 3): string[] {
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));
  const out: string[] = [];
  for (const w of question.toUpperCase().match(/[A-Z][A-Z0-9]{1,9}/g) ?? []) {
    if (bySymbol.has(w) && !COMMON_WORDS.has(w) && !out.includes(w)) out.push(w);
  }
  // company names: "lucky cement", "meezan bank"
  const q = question.toLowerCase();
  for (const s of stocks) {
    if (out.length >= max) break;
    const words = s.name
      .toLowerCase()
      .replace(/\b(limited|ltd|company|corporation|co|pakistan|industries|the)\b\.?/g, '')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (words.length && q.includes(words.slice(0, 2).join(' ')) && !out.includes(s.symbol)) out.push(s.symbol);
  }
  return out.slice(0, max);
}

/** The sector a question is about, if it names one. */
export function mentionedSector(question: string, stocks: Stock[]): string | null {
  const q = question.toLowerCase();
  const sectors = Array.from(new Set(stocks.map((s) => s.sector))).filter((s) => s && s !== 'Other');
  const aliases: Record<string, RegExp> = {
    bank: /\bbanks?\b|banking/,
    cement: /cement/,
    fertilizer: /fertili[sz]er/,
    'oil & gas': /\boil\b|\bgas\b|exploration|e&p/,
    power: /\bpower\b|electric|ipp/,
    technology: /\btech|software|\bit\b/,
    pharma: /pharma|medicine/,
    auto: /\bauto|\bcars?\b|automobile/,
    textile: /textile/,
  };
  for (const sec of sectors) {
    const low = sec.toLowerCase();
    if (q.includes(low)) return sec;
    for (const [key, re] of Object.entries(aliases)) if (low.includes(key.split(' ')[0]) && re.test(q)) return sec;
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

export function screeningTable(question: string, stocks: Stock[], limit = 30): string {
  const q = question.toLowerCase();
  let rows = stocks.filter((s) => s.price != null && (s.marketCap ?? 0) > 0);
  const sector = mentionedSector(question, stocks);
  if (sector) rows = rows.filter((s) => s.sector === sector);
  if (/shariah|islamic|halal/.test(q)) rows = rows.filter((s) => s.shariah);
  rows = rows.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, limit);
  const head = 'symbol | sector | price | today % | 1y % | P/E | div yield % | ROE % | shariah';
  const lines = rows.map((s) => {
    const roe = roeOf(s);
    return [s.symbol, s.sector, f(s.price, 2), f(s.changePct), f(s.change1y), s.pe != null && s.pe > 0 ? f(s.pe) : '-', f(s.divYield), roe == null ? '-' : f(roe * 100), s.shariah ? 'yes' : 'no'].join(' | ');
  });
  const title = `STOCKS${sector ? ` IN ${sector.toUpperCase()}` : ''}${/shariah|islamic|halal/.test(q) ? ' (SHARIAH ONLY)' : ''}, LARGEST ${rows.length} BY MARKET CAP`;
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

/** Full data pack for one symbol, fetched live. */
export async function packFor(symbol: string, stocks: Stock[]): Promise<string> {
  const stock = stocks.find((s) => s.symbol === symbol);
  const [company, daily] = await Promise.all([
    fetchCompany(symbol).catch(() => null),
    fetchDailyCandles(symbol).catch(() => []),
  ]);
  const balance = balanceSheetFor(symbol);
  const peers = stock ? stocks.filter((s) => s.sector === stock.sector && s.symbol !== symbol).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) : [];
  return stockContext({
    stock,
    company,
    analysis: daily.length ? analyze(daily) : null,
    tech: daily.length ? technicals(daily) : null,
    ratios: computeRatios(balance, company, stock),
    balance,
    peers,
    today: new Date().toISOString().slice(0, 10),
  });
}

/** Everything the model sees for one question. */
export async function chatContext(question: string, stocks: Stock[], indices: IndexQuote[]): Promise<{ text: string; symbols: string[] }> {
  const symbols = mentionedSymbols(question, stocks);
  const parts = [marketSnapshot(stocks, indices)];
  for (const sym of symbols) parts.push(await packFor(sym, stocks));
  if (symbols.length < 2) parts.push(screeningTable(question, stocks, symbols.length ? 15 : 30));
  return { text: parts.join('\n\n'), symbols };
}
