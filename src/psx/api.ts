/**
 * Network client for dps.psx.com.pk.
 *
 * The portal has no official API. Its own pages load JSON with an
 * `X-Req-Id` header whose value is embedded in every HTML page
 * (`window.__ps._k`). We read that token from a page we need anyway
 * (/indices) and send it on the JSON calls, exactly like the website does.
 * Keep requests few: we are a guest on PSX's server.
 */
import {
  adjustCandles,
  extractToken,
  parseHistorical,
  parseIndexConstituents,
  parseCompany,
  parseIndices,
  parseScreener,
  parseSymbols,
  parseTimeseries,
  parseTradingBoard,
} from './parse';
import type { BoardQuote, Candle, Constituent, CompanyInfo, IndexQuote, ScreenerRow, SeriesPoint, SymbolInfo } from './types';

export const PSX_BASE = process.env.EXPO_PUBLIC_PSX_BASE || 'https://dps.psx.com.pk';
const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const TOKEN_TTL = 20 * 60_000;

let token: string | null = null;
let tokenAt = 0;
let tokenPromise: Promise<void> | null = null;

export class PsxError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PsxError';
  }
}

async function request(
  path: string,
  opts: { xhr?: boolean; timeoutMs?: number; form?: Record<string, string> } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: opts.xhr ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,*/*',
    };
    if (opts.xhr) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers['Referer'] = `${PSX_BASE}/`;
      if (token) headers['X-Req-Id'] = token;
    }
    let body: string | undefined;
    if (opts.form) {
      body = Object.entries(opts.form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    const res = await fetch(PSX_BASE + path, { method: body ? 'POST' : 'GET', headers, body, signal: controller.signal });
    if (!res.ok) throw new PsxError(`PSX returned ${res.status} for ${path}`, res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof PsxError) throw e;
    const aborted = (e as Error)?.name === 'AbortError';
    throw new PsxError(aborted ? 'PSX took too long to respond' : 'No connection to PSX');
  } finally {
    clearTimeout(timer);
  }
}

function remember(html: string) {
  const t = extractToken(html);
  if (t) {
    token = t;
    tokenAt = Date.now();
  }
}

async function ensureToken(force = false) {
  if (!force && token && Date.now() - tokenAt < TOKEN_TTL) return;
  if (!tokenPromise) {
    tokenPromise = request('/indices')
      .then(remember)
      .finally(() => {
        tokenPromise = null;
      });
  }
  await tokenPromise;
}

/** A JSON/fragment call that needs the token; refreshes it once on 403/404. */
async function xhr(path: string, form?: Record<string, string>, timeoutMs?: number): Promise<string> {
  await ensureToken();
  try {
    return await request(path, { xhr: true, form, timeoutMs });
  } catch (e) {
    if (e instanceof PsxError && (e.status === 403 || e.status === 404)) {
      await ensureToken(true);
      return request(path, { xhr: true, form, timeoutMs });
    }
    throw e;
  }
}

export async function fetchIndices(): Promise<IndexQuote[]> {
  const html = await request('/indices');
  remember(html);
  return parseIndices(html);
}

export async function fetchBoard(): Promise<BoardQuote[]> {
  return parseTradingBoard(await xhr('/trading-board/REG/main'));
}

export async function fetchScreener(): Promise<ScreenerRow[]> {
  const html = await request('/screener', { timeoutMs: 40_000 });
  remember(html);
  return parseScreener(html);
}

export async function fetchSymbols(): Promise<SymbolInfo[]> {
  return parseSymbols(JSON.parse(await xhr('/symbols')));
}

export async function fetchSeries(kind: 'eod' | 'int', symbol: string): Promise<SeriesPoint[]> {
  return parseTimeseries(JSON.parse(await xhr(`/timeseries/${kind}/${encodeURIComponent(symbol)}`)));
}

export async function fetchCompany(symbol: string): Promise<CompanyInfo> {
  const html = await request(`/company/${encodeURIComponent(symbol)}`);
  remember(html);
  return parseCompany(symbol, html);
}

/** Full daily OHLC history (about 10 years), adjusted for splits and bonus issues. */
export async function fetchDailyCandles(symbol: string): Promise<Candle[]> {
  const [html, eod] = await Promise.all([
    xhr('/historical', { month: '0', year: '0', symbol }, 40_000),
    fetchSeries('eod', symbol).catch(() => [] as SeriesPoint[]),
  ]);
  return adjustCandles(parseHistorical(html), eod);
}

/**
 * Raw daily bars for one calendar month (month 1–12), not adjusted for splits.
 * Used to top up saved history without downloading ten years again.
 */
export async function fetchMonthCandles(symbol: string, year: number, month: number): Promise<Candle[]> {
  return parseHistorical(await xhr('/historical', { month: String(month), year: String(year), symbol }, 20_000));
}

/** Raw HTML of a PSX request, for probes and size checks. */
export async function fetchRaw(path: string, form?: Record<string, string>, asXhr = true): Promise<string> {
  return asXhr ? xhr(path, form, 40_000) : request(path, { timeoutMs: 40_000 });
}

/** Stocks in an index with their weight and the points they moved it today. */
export async function fetchIndexConstituents(code: string): Promise<Constituent[]> {
  return parseIndexConstituents(await xhr(`/indices/${encodeURIComponent(code)}`));
}

/** Display names for PSX index codes (PSX itself publishes only the codes). */
export const INDEX_NAMES: Record<string, string> = {
  KSE100: 'KSE-100',
  KSE100PR: 'KSE-100 Price Return',
  ALLSHR: 'All Share',
  KSE30: 'KSE-30',
  KMI30: 'KMI-30',
  BKTI: 'Banks Tradable',
  OGTI: 'Oil & Gas Tradable',
  KMIALLSHR: 'KMI All Share',
  PSXDIV20: 'PSX Dividend 20',
  UPP9: 'UBL Pakistan Enterprise',
  NITPGI: 'NIT Pakistan Gateway',
  NBPPGI: 'NBP Pakistan Growth',
  MZNPI: 'Meezan Pakistan',
  JSMFI: 'JS Momentum Factor',
  ACI: 'Alfalah Consumer',
  JSGBKTI: 'JS Global Banking',
  MII30: 'Mahaana Islamic 30',
  HBLTTI: 'HBL Total Treasury',
};

/** One-line description where the index's purpose is well known. */
export const INDEX_ABOUT: Record<string, string> = {
  KSE100: 'The benchmark: 100 large companies weighted by free-float market cap.',
  KSE100PR: 'KSE-100 without dividends reinvested.',
  ALLSHR: 'Every eligible listed company on PSX.',
  KSE30: 'The 30 largest, most liquid companies.',
  KMI30: '30 Shariah-compliant companies screened by Meezan Bank.',
  KMIALLSHR: 'All Shariah-compliant listed companies.',
  BKTI: 'Tradable banking stocks.',
  OGTI: 'Tradable oil and gas stocks.',
  PSXDIV20: '20 companies with strong dividend records.',
};

export const MAIN_INDICES = ['KSE100', 'KMI30', 'KSE30', 'ALLSHR', 'KMIALLSHR'];
