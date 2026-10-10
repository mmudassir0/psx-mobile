/**
 * Parsers for the public PSX data portal (dps.psx.com.pk), written against
 * real pages captured on 10 Oct 2026. Pure functions: no network, no RN APIs,
 * so they can be unit-tested in Node (see scripts/test-parsers.ts).
 */
import { decodeEntities, num, readRows, stripTags } from './html';
import type {
  Announcement,
  BoardQuote,
  CompanyInfo,
  IndexQuote,
  ScreenerRow,
  SeriesPoint,
  SymbolInfo,
} from './types';

/** Prefer the exact `data-order` value PSX puts on numeric cells. */
function cellNum(cell: { text: string; attrs: Record<string, string> } | undefined): number | null {
  if (!cell) return null;
  const ordered = cell.attrs['data-order'];
  if (ordered != null && ordered !== '') {
    const v = num(ordered);
    if (v != null) return v;
  }
  return num(cell.text);
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * PSX appends corporate-action flags to tickers (FFCXD, IPAKXB) and
 * board markers ("JUBS NC"). Normalise to the base ticker.
 */
export function normalizeSymbol(raw: string): string {
  const first = raw.trim().toUpperCase().split(/\s+/)[0] ?? '';
  const m = first.match(/^(.{2,})(XD|XB|XR|XA)$/);
  return m ? m[1] : first;
}

/** The anti-scraping request token the site's own scripts send as X-Req-Id. */
export function extractToken(html: string): string | null {
  const m = html.match(/"_k"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// /indices — INDEX | HIGH | LOW | CURRENT | CHANGE | % CHANGE
export function parseIndices(html: string): IndexQuote[] {
  const out: IndexQuote[] = [];
  const seen = new Set<string>();
  for (const row of readRows(html)) {
    const c = row.cells;
    if (c.length < 6) continue;
    const code = c[0].text.trim();
    if (!/^[A-Z0-9]{2,20}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      high: cellNum(c[1]),
      low: cellNum(c[2]),
      current: cellNum(c[3]),
      change: cellNum(c[4]),
      changePct: cellNum(c[5]),
    });
  }
  return out;
}

// /trading-board/REG/main —
// SYMBOL | NAME | BID VOL | BID | OFFER VOL | OFFER | LDCP | CHANGE | VOLUME
export function parseTradingBoard(html: string): BoardQuote[] {
  const out: BoardQuote[] = [];
  const seen = new Set<string>();
  for (const row of readRows(html)) {
    const c = row.cells;
    if (c.length < 9) continue;
    const raw = c[0].attrs['data-search'] || c[0].text;
    if (!raw || !/^[A-Z0-9][A-Z0-9 .-]{1,24}$/i.test(raw.trim())) continue;
    const symbol = normalizeSymbol(raw);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const ldcp = cellNum(c[6]);
    const change = cellNum(c[7]);
    const price = ldcp != null && change != null ? round(ldcp + change) : ldcp;
    const changePct = ldcp && change != null ? round((change / ldcp) * 100) : null;
    out.push({
      symbol,
      name: decodeEntities(c[1].attrs['data-search'] || c[1].text).replace(/\s+/g, ' ').trim(),
      bidVol: cellNum(c[2]),
      bid: cellNum(c[3]),
      askVol: cellNum(c[4]),
      ask: cellNum(c[5]),
      ldcp,
      change,
      price,
      changePct,
      volume: cellNum(c[8]),
    });
  }
  return out;
}

// /screener — SYMBOL | SECTOR | LISTED IN | MARKET CAP | PRICE | CHANGE % |
// 1-YEAR % | PE | DIV YIELD % | FREE FLOAT | 30D VOLUME AVG
export function parseScreener(html: string): ScreenerRow[] {
  const out: ScreenerRow[] = [];
  for (const row of readRows(html)) {
    const c = row.cells;
    if (c.length < 11) continue;
    const raw = c[0].attrs['data-order'] || c[0].text;
    if (!raw || !/^[A-Z0-9][A-Z0-9.-]{1,20}$/i.test(raw.trim())) continue;
    const indexes = c[2].text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({
      symbol: normalizeSymbol(raw),
      sectorCode: c[1].text.trim(),
      indexes,
      shariah: indexes.includes('KMIALLSHR') || indexes.includes('KMI30'),
      marketCap: cellNum(c[3]),
      price: cellNum(c[4]),
      changePct: cellNum(c[5]),
      change1y: cellNum(c[6]),
      pe: cellNum(c[7]),
      divYield: cellNum(c[8]),
      freeFloat: cellNum(c[9]),
      avgVol30: cellNum(c[10]),
    });
  }
  return out;
}

export function parseSymbols(json: unknown): SymbolInfo[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x) => x && typeof x.symbol === 'string')
    .map((x) => ({
      symbol: String(x.symbol).toUpperCase(),
      name: String(x.name ?? x.symbol),
      sectorName: String(x.sectorName ?? ''),
      isETF: !!x.isETF,
      isDebt: !!x.isDebt,
    }));
}

/**
 * /timeseries/{eod|int}/{SYMBOL} → {status, data: [[unixSec, value, volume, open?], …]}
 * newest first. Returned oldest first, in ms.
 */
export function parseTimeseries(json: unknown): SeriesPoint[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const pts: SeriesPoint[] = [];
  for (const d of data) {
    if (!Array.isArray(d) || d.length < 2) continue;
    const t = Number(d[0]) * 1000;
    const v = Number(d[1]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    const p: SeriesPoint = { t, v, vol: Number(d[2]) || 0 };
    if (d.length > 3 && Number.isFinite(Number(d[3]))) p.open = Number(d[3]);
    pts.push(p);
  }
  pts.sort((a, b) => a.t - b.t);
  return pts;
}

// /company/{SYMBOL}

function statsMap(html: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /class="stats_label">([\s\S]*?)<\/div>\s*<div class="stats_value[^"]*">([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = stripTags(m[1])
      .replace(/[\s*^]+$/g, '')
      .replace(/\s*\(000'?\s*s?\s*\)\s*/i, '')
      .trim()
      .toLowerCase();
    const value = stripTags(m[2]);
    if (!label) continue;
    const list = map.get(label);
    if (list) list.push(value);
    else map.set(label, [value]);
  }
  return map;
}

function range(raw: string | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const parts = raw.split(/[—–]|\s-\s/).map((p) => num(p));
  return parts.length >= 2 ? [parts[0], parts[1]] : [null, null];
}

function firstText(html: string, cls: string): string | null {
  const re = new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)<\\/div>`);
  const m = html.match(re);
  return m ? stripTags(m[1]) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseLooseDate(raw: string): string | null {
  const m = raw.trim().match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

function parseAnnouncements(html: string): Announcement[] {
  const out: Announcement[] = [];
  const seen = new Set<string>();
  const start = html.indexOf('id="announcements"');
  if (start < 0) return out;
  const end = html.indexOf('id="financials"', start);
  const section = html.slice(start, end > start ? end : undefined);
  // Each tab panel is one category.
  const panelRe = /<div class="tabs__panel" data-name="([^"]+)">([\s\S]*?)<\/table>/g;
  let p: RegExpExecArray | null;
  while ((p = panelRe.exec(section))) {
    const category = p[1];
    for (const row of readRows(p[2])) {
      const c = row.cells;
      if (c.length < 2) continue;
      const date = parseLooseDate(c[0].text);
      const title = c[1].text;
      if (!date || title.length < 6) continue;
      const key = date + title;
      if (seen.has(key)) continue;
      seen.add(key);
      const pdf = c[2]?.html.match(/href="(\/download\/document\/[^"]+\.pdf)"/i);
      out.push({ date, title, url: pdf ? `https://dps.psx.com.pk${pdf[1]}` : null, category });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function parseCompany(symbol: string, html: string): CompanyInfo {
  const stats = statsMap(html);
  const first = (label: string) => stats.get(label.toLowerCase())?.[0];
  const [week52Low, week52High] = range(first('52-WEEK RANGE'));
  const [circuitLow, circuitHigh] = range(first('CIRCUIT BREAKER'));
  const ff = stats.get('free float') ?? [];
  const mcapThousands = num(first('Market Cap'));

  const nameRaw = html.match(/class="quote__name">([\s\S]*?)(<div|<\/div>)/);
  const name = nameRaw ? stripTags(nameRaw[1]) || null : null;
  const pctRaw = firstText(html, 'change__percent');

  const profileStart = html.indexOf('BUSINESS DESCRIPTION');
  let description: string | null = null;
  if (profileStart >= 0) {
    const seg = html.slice(profileStart, profileStart + 4000);
    const pm = seg.match(/<\/div>\s*<p[^>]*>([\s\S]*?)<\/p>/) || seg.match(/<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/);
    description = pm ? stripTags(pm[1]) || null : null;
  }

  return {
    symbol,
    name,
    sector: firstText(html, 'quote__sector'),
    close: num(firstText(html, 'quote__close')),
    change: num(firstText(html, 'change__value')),
    changePct: pctRaw ? num(pctRaw.replace(/[()]/g, '')) : null,
    asOf: (firstText(html, 'quote__date') ?? '').replace(/^\^\s*/, '') || null,
    open: num(first('Open')),
    high: num(first('High')),
    low: num(first('Low')),
    volume: num(first('Volume')),
    ldcp: num(first('LDCP')),
    circuitLow,
    circuitHigh,
    week52Low,
    week52High,
    pe: num(first('P/E Ratio (TTM)')),
    change1y: num(first('1-Year Change')),
    ytd: num(first('YTD Change')),
    marketCap: mcapThousands == null ? null : mcapThousands * 1000,
    shares: num(first('Shares')),
    freeFloatPct: num(ff.find((v) => v.includes('%'))),
    description,
    announcements: parseAnnouncements(html),
  };
}
