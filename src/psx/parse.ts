/**
 * Parsers for the public PSX data portal (dps.psx.com.pk), written against
 * real pages captured on 10 Oct 2026. Pure functions: no network, no RN APIs,
 * so they can be unit-tested in Node (see scripts/test-parsers.ts).
 */
import { decodeEntities, num, readRows, stripTags } from './html';
import type { Announcement, FinTable, Person, BoardQuote, Candle, CompanyInfo, Constituent, IndexQuote, ScreenerRow, SeriesPoint, SymbolInfo } from './types';

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
      changePct: sanePct(cellNum(c[5])),
    });
  }
  return out;
}

/**
 * A day's % change that can't be real: PSX limits a day's move to about 10% (or Rs 1 for cheap shares), so
 * anything from 100% up comes from a near-zero previous close (a letter of rights, a fresh listing). Shown as
 * unknown rather than topping every gainers list.
 */
export function sanePct(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) || Math.abs(v) >= 100 ? null : v;
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
    const changePct = ldcp && change != null ? sanePct(round((change / ldcp) * 100)) : null;
    out.push({
      symbol,
      name: decodeEntities(c[1].attrs['data-search'] || c[1].text)
        .replace(/\s+/g, ' ')
        .trim(),
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
      changePct: sanePct(cellNum(c[5])),
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

/** First <table> after `marker` (optionally limited to the panel named `panel`) as a FinTable. */
function finTable(html: string, marker: string, panel?: string): FinTable | null {
  let start = html.indexOf(marker);
  if (start < 0) return null;
  if (panel) {
    const p = html.indexOf(`class="tabs__panel" data-name="${panel}"`, start);
    if (p < 0) return null;
    start = p;
  }
  const t0 = html.indexOf('<table', start);
  const t1 = html.indexOf('</table>', t0);
  if (t0 < 0 || t1 < 0) return null;
  const table = html.slice(t0, t1);
  const head = readRows(table, 'th')[0];
  const periods = head ? head.cells.slice(1).map((c) => c.text) : [];
  const rows = readRows(table, 'td')
    .filter((r) => r.cells.length > 1)
    .map((r) => ({ label: r.cells[0].text, values: r.cells.slice(1).map((c) => num(c.text)) }));
  return periods.length && rows.length ? { periods, rows } : null;
}

/** Text of the <p> following an `item__head` label in the profile section. */
function profileItem(html: string, head: string): { text: string; html: string } | null {
  const re = new RegExp(`class="item__head">\\s*${head}\\s*<\\/div>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>`, 'i');
  const m = html.match(re);
  return m ? { text: stripTags(m[1]), html: m[1] } : null;
}

function parsePeople(html: string): Person[] {
  const i = html.indexOf('KEY PEOPLE');
  if (i < 0) return [];
  const end = html.indexOf('</table>', i);
  return readRows(html.slice(i, end > i ? end : undefined))
    .filter((r) => r.cells.length >= 2 && r.cells[0].text)
    .map((r) => ({ name: r.cells[0].text, role: r.cells[1].text }));
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
    financialsAnnual: finTable(html, 'id="financials"', 'Annual'),
    financialsQuarterly: finTable(html, 'id="financials"', 'Quarterly'),
    ratios: finTable(html, 'id="ratios"'),
    people: parsePeople(html),
    address: profileItem(html, 'ADDRESS')?.text || null,
    website: (() => {
      const w = profileItem(html, 'WEBSITE');
      const href = w?.html.match(/href="([^"]+)"/)?.[1];
      return href || w?.text || null;
    })(),
    registrar: profileItem(html, 'REGISTRAR')?.text || null,
    auditor: profileItem(html, 'AUDITOR')?.text || null,
    fiscalYearEnd: profileItem(html, 'Fiscal Year End')?.text || null,
  };
}

// POST /historical (symbol only) — DATE | OPEN | HIGH | LOW | CLOSE | VOLUME,
// newest first, unadjusted for splits/bonus. Returned oldest first.
export function parseHistorical(html: string): Candle[] {
  const out: Candle[] = [];
  for (const row of readRows(html)) {
    const c = row.cells;
    if (c.length < 6) continue;
    const ts = Number(c[0].attrs['data-order']);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const o = num(c[1].text);
    const h = num(c[2].text);
    const l = num(c[3].text);
    const cl = num(c[4].text);
    if (o == null || h == null || l == null || cl == null || cl <= 0) continue;
    out.push({ t: ts * 1000, o, h, l, c: cl, v: num(c[5].text) ?? 0 });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * PSX's /historical prices are raw: a 5:1 split shows as an 80% crash. The
 * /timeseries/eod closes are adjusted, and both use the same day timestamps,
 * so each day's factor is eodClose / rawClose. Days before the EOD series
 * starts reuse its earliest factor, and are then checked for older gaps.
 */
/**
 * A day whose open is further below the previous close than PSX's daily price
 * limit allows (10%, and more than Rs 1): the reference price was reset
 * overnight by a corporate action (bonus issue, split, rights issue) or a large
 * cash dividend. Either way the drop isn't a market move.
 */
export function actionGapAt(c: Candle[], i: number): number | null {
  if (i < 1) return null;
  const prev = c[i - 1].c;
  const open = c[i].o > 0 ? c[i].o : c[i].c;
  if (!(prev > 0) || !(open > 0)) return null;
  return open < prev * 0.89 && prev - open > 1 ? open / prev : null;
}

export function adjustCandles(raw: Candle[], eod: SeriesPoint[]): Candle[] {
  if (!raw.length) return raw;
  if (!eod.length) return adjustOldGaps(raw, raw.length);
  const adjClose = new Map(eod.map((p) => [p.t, p.v]));
  const factors: (number | null)[] = raw.map((c) => {
    const a = adjClose.get(c.t);
    if (a == null || !(c.c > 0)) return null;
    const f = a / c.c;
    return Number.isFinite(f) && f > 0 ? f : null;
  });
  // Fill gaps: carry the next known factor backwards, then the last known forwards.
  let next: number | null = null;
  for (let i = factors.length - 1; i >= 0; i--) {
    if (factors[i] != null) next = factors[i];
    else factors[i] = next;
  }
  let prev: number | null = null;
  for (let i = 0; i < factors.length; i++) {
    if (factors[i] != null) prev = factors[i];
    else factors[i] = prev ?? 1;
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  const out = raw.map((c, i) => {
    const f = factors[i] as number;
    if (Math.abs(f - 1) < 0.002) return c;
    return { t: c.t, o: r(c.o * f), h: r(c.h * f), l: r(c.l * f), c: r(c.c * f), v: Math.round(c.v / f) };
  });
  // PSX's adjusted series covers about five years; older bonus issues and splits are found from the price gap.
  const firstKnown = raw.findIndex((c) => adjClose.has(c.t));
  return adjustOldGaps(out, firstKnown < 0 ? raw.length : firstKnown);
}

/**
 * Adjusts bars before `until` for gaps beyond the daily limit (see actionGapAt),
 * newest first, so old bonus issues, splits and large dividends don't look like
 * crashes. Used where PSX's own adjusted series doesn't reach.
 */
export function adjustOldGaps(bars: Candle[], until: number): Candle[] {
  const out = bars.slice();
  const r = (v: number) => Math.round(v * 100) / 100;
  for (let i = Math.min(until, out.length - 1); i >= 1; i--) {
    const f = actionGapAt(out, i);
    if (f == null) continue;
    for (let j = 0; j < i; j++) {
      const c = out[j];
      out[j] = { t: c.t, o: r(c.o * f), h: r(c.h * f), l: r(c.l * f), c: r(c.c * f), v: Math.round(c.v / f) };
    }
  }
  return out;
}

/** Group a series of ticks [price, cumulative-trade volume] into fixed bars. */
export function ticksToCandles(ticks: SeriesPoint[], minutes: number): Candle[] {
  const size = minutes * 60_000;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const p of ticks) {
    const start = Math.floor(p.t / size) * size;
    if (!cur || cur.t !== start) {
      if (cur) out.push(cur);
      cur = { t: start, o: p.v, h: p.v, l: p.v, c: p.v, v: p.vol };
    } else {
      cur.h = Math.max(cur.h, p.v);
      cur.l = Math.min(cur.l, p.v);
      cur.c = p.v;
      cur.v += p.vol;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Merge daily bars into weekly (Mon-start, PKT) or monthly bars. */
export function groupCandles(daily: Candle[], by: 'week' | 'month'): Candle[] {
  const out: Candle[] = [];
  let key = '';
  let cur: Candle | null = null;
  for (const d of daily) {
    const pk = new Date(d.t + 5 * 3600_000);
    let k: string;
    if (by === 'month') k = `${pk.getUTCFullYear()}-${pk.getUTCMonth()}`;
    else {
      const day = (pk.getUTCDay() + 6) % 7;
      const monday = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate() - day);
      k = String(monday);
    }
    if (k !== key || !cur) {
      if (cur) out.push(cur);
      key = k;
      cur = { ...d };
    } else {
      cur.h = Math.max(cur.h, d.h);
      cur.l = Math.min(cur.l, d.l);
      cur.c = d.c;
      cur.v += d.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// /indices/{CODE} — SYMBOL | NAME | LDCP | CURRENT | CHANGE | CHANGE % |
// IDX WTG % | IDX POINT | VOLUME | FREEFLOAT (M) | MARKET CAP (M)
export function parseIndexConstituents(html: string): Constituent[] {
  const out: Constituent[] = [];
  const seen = new Set<string>();
  for (const row of readRows(html)) {
    const c = row.cells;
    if (c.length < 11) continue;
    const raw = c[0].attrs['data-order'] || c[0].text;
    if (!raw || !/^[A-Z0-9][A-Z0-9 .-]{1,24}$/i.test(raw.trim())) continue;
    const symbol = normalizeSymbol(raw);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const mcapRaw = num(c[10].attrs['data-order']);
    out.push({
      symbol,
      name: c[1].text,
      ldcp: cellNum(c[2]),
      price: cellNum(c[3]),
      change: cellNum(c[4]),
      changePct: sanePct(cellNum(c[5])),
      weight: num(c[6].text),
      points: cellNum(c[7]),
      volume: cellNum(c[8]),
      freeFloatM: num(c[9].text),
      // data-order holds full PKR; the text is in millions
      marketCap: mcapRaw ?? (num(c[10].text) != null ? (num(c[10].text) as number) * 1e6 : null),
    });
  }
  return out;
}
