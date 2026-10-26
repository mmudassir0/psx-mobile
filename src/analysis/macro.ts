/**
 * Pakistan's economy in numbers that move shares: the State Bank's policy
 * rate, T-bill and bond yields, KIBOR, the dollar rate, reserves, inflation and
 * the petrol price. The daily job reads them from the SBP homepage (its "key
 * indicators" snapshot) and other public pages, and keeps a history.
 */

export interface MacroNow {
  /** YYYY-MM-DD the job read them */
  day: string;
  policy: number | null;
  /** the SBP's latest decision headline, e.g. "increase the policy rate by 50 bps to 12% w.e.f. October 27, 2026" */
  mpc: string | null;
  kibor: { m3: number | null; m6: number | null; m12: number | null; asOf: string | null };
  tbills: { m1: number | null; m3: number | null; m6: number | null; m12: number | null; asOf: string | null };
  pibs: { y2: number | null; y3: number | null; y5: number | null; y10: number | null; asOf: string | null };
  usd: number | null;
  usdAsOf: string | null;
  /** foreign exchange reserves, USD million */
  reserves: { sbp: number | null; total: number | null; asOf: string | null };
  /** CPI inflation, year on year, % */
  cpi: number | null;
  cpiMonth: string | null;
  /** petrol, Rs a litre */
  petrol: number | null;
  petrolFrom: string | null;
}

/** [day, policy, usd, tbill12m, cpi, petrol] */
export type MacroRow = [string, number | null, number | null, number | null, number | null, number | null];

export interface MacroFeed {
  v: 1;
  kind: 'macro';
  generatedAt: string;
  now: MacroNow;
  history: MacroRow[];
  /** PBS's monthly series: [YYYY-MM, year-on-year %, month-on-month %] */
  inflation?: [string, number, number | null][];
}

export const isMacroFeed = (x: unknown): x is MacroFeed => {
  const f = x as MacroFeed | null;
  return !!f && f.v === 1 && f.kind === 'macro' && !!f.now && Array.isArray(f.history);
};

const n = (s: string | undefined) => {
  if (s == null) return null;
  const v = Number(s.replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
};

export const plainText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ');

/** Pairs like "3-M 11.9999%" or "5-Y 12.49%" in the text after `from`, up to the first "(as on …)". */
function tenors(text: string, from: number, unit: 'M' | 'Y'): { map: Record<string, number>; asOf: string | null } {
  const seg = text.slice(from, from + 600);
  const end = seg.search(/\(as on/i);
  const body = end >= 0 ? seg.slice(0, end) : seg.slice(0, 300);
  const map: Record<string, number> = {};
  for (const m of body.matchAll(new RegExp(`(\\d+)-${unit}\\s+([\\d.]+)%`, 'g'))) map[m[1]] = Number(m[2]);
  const asOf = end >= 0 ? seg.slice(end).match(/\(as on ([^)]+)\)/i)?.[1]?.trim() ?? null : null;
  return { map, asOf };
}

/** Reads the SBP homepage's key-indicators snapshot. Anything not found is null. */
export function parseSbp(html: string): Omit<MacroNow, 'day' | 'cpi' | 'cpiMonth' | 'petrol' | 'petrolFrom'> {
  const t = plainText(html);
  const policy = n(t.match(/SBP Policy Rate\s+([\d.]+)\s*%/i)?.[1]);
  const mpc = t.match(/MPC has decided to (.+?)\.\s*Read More/i)?.[1]?.trim() ?? null;
  const kb = t.match(/KIBOR As on\s+(.+?)\s+Tenor BID Offer\s+3-M\s+([\d.]+)\s+([\d.]+)\s+6-M\s+([\d.]+)\s+([\d.]+)\s+12-M\s+([\d.]+)\s+([\d.]+)/i);
  const mid = (a?: string, b?: string) => (a && b ? Math.round(((Number(a) + Number(b)) / 2) * 100) / 100 : null);
  const mtbAt = t.search(/Latest Auctions\s+MTBs/i);
  const mtb = mtbAt >= 0 ? tenors(t, mtbAt, 'M') : { map: {}, asOf: null };
  const pibAt = t.search(/Fixed\s*-\s*Rate PIB\s+Tenor/i);
  const pib = pibAt >= 0 ? tenors(t, pibAt, 'Y') : { map: {}, asOf: null };
  const usd = t.match(/USD\/\s*PKR Rates As on\s+(.+?)\s+M2M Revaluation Rate\s+([\d.]+)/i);
  const res = t.match(/Reserves \(USD million\) As on\s+(.+?)\s+SBP.s Reserves\s+([\d,.]+)\s+Bank.s Reserves\s+([\d,.]+)\s+Total Reserves\s+([\d,.]+)/i);
  return {
    policy,
    mpc,
    kibor: { m3: mid(kb?.[2], kb?.[3]), m6: mid(kb?.[4], kb?.[5]), m12: mid(kb?.[6], kb?.[7]), asOf: kb?.[1]?.replace(/\s+/g, ' ').trim() ?? null },
    tbills: { m1: mtb.map['1'] ?? null, m3: mtb.map['3'] ?? null, m6: mtb.map['6'] ?? null, m12: mtb.map['12'] ?? null, asOf: mtb.asOf },
    pibs: { y2: pib.map['2'] ?? null, y3: pib.map['3'] ?? null, y5: pib.map['5'] ?? null, y10: pib.map['10'] ?? null, asOf: pib.asOf },
    usd: n(usd?.[2]),
    usdAsOf: usd?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
    reserves: { sbp: n(res?.[2]), total: n(res?.[4]), asOf: res?.[1]?.replace(/\s+/g, ' ').trim() ?? null },
  };
}

/** The petrol price from a news story like "petrol price went up from Rs377.71 to Rs379.25 per litre". */
export function petrolFromNews(text: string): number | null {
  const m = text.match(/petrol(?: price)?[^.]{0,80}?(?:from Rs\.?\s*[\d.]+ )?to Rs\.?\s*([\d.]+)\s*(?:per|a) lit/i) ?? text.match(/petrol[^.]{0,40}?(?:at|to) Rs\.?\s*([\d.]+)\s*(?:per|a) lit/i);
  const v = m ? Number(m[1]) : null;
  return v != null && v > 50 && v < 2000 ? v : null;
}

/** Inflation from a story like "CPI inflation clocked in at 5.6% in September" or "inflation … to 5.6pc". */
export function cpiFromNews(text: string): { cpi: number; month: string | null } | null {
  const m = text.match(/(?:CPI|consumer price index|headline inflation|inflation)[^.]{0,80}?(?:at|to|of|was)\s+(-?[\d.]+)\s*(?:%|pc|per ?cent)/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!(v > -10 && v < 60)) return null;
  const month = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i)?.[1] ?? null;
  return { cpi: v, month };
}

/**
 * Shares against safe returns: the market's earnings yield (1 ÷ P/E,
 * value-weighted over the index members) and dividend yield, against the
 * 12-month T-bill.
 */
export function marketYields(stocks: { indexes: string[]; marketCap: number | null; pe: number | null; divYield: number | null }[], index = 'KSE100') {
  const m = stocks.filter((s) => s.indexes.includes(index) && (s.marketCap ?? 0) > 0);
  const cap = m.reduce((a, s) => a + (s.marketCap ?? 0), 0);
  const earners = m.filter((s) => s.pe != null && s.pe > 0);
  const earnings = earners.reduce((a, s) => a + (s.marketCap ?? 0) / s.pe!, 0);
  const capE = earners.reduce((a, s) => a + (s.marketCap ?? 0), 0);
  const divs = m.filter((s) => s.divYield != null).reduce((a, s) => a + ((s.marketCap ?? 0) * s.divYield!) / 100, 0);
  return { pe: earnings > 0 ? capE / earnings : null, earningsYield: capE > 0 ? (earnings / capE) * 100 : null, dividendYield: cap > 0 ? (divs / cap) * 100 : null, count: m.length };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The monthly inflation series behind PBS's homepage chart: [YYYY-MM, year-on-year %, month-on-month %]. */
export function parsePbsInflation(html: string): [string, number, number | null][] {
  const i = html.indexOf('inflationChart');
  if (i < 0) return [];
  const s = html.slice(i, i + 8000);
  const cats = s.match(/categories:\s*\[([^\]]*)\]/)?.[1];
  if (!cats) return [];
  const months = [...cats.matchAll(/'([A-Za-z]+)\s+(\d{4})'/g)].map((m) => {
    const k = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return k < 0 ? null : `${m[2]}-${String(k + 1).padStart(2, '0')}`;
  });
  const series = (name: RegExp) => {
    const at = s.search(name);
    if (at < 0) return null;
    const d = s.slice(at).match(/data:\s*\[([^\]]*)\]/)?.[1];
    return d ? d.split(',').map((x) => Number(x.trim())) : null;
  };
  const yoy = series(/name:\s*'[^']*YoY/i);
  const mom = series(/name:\s*'[^']*MoM/i);
  if (!yoy) return [];
  const out: [string, number, number | null][] = [];
  months.forEach((m, k) => {
    if (m && Number.isFinite(yoy[k])) out.push([m, yoy[k], mom && Number.isFinite(mom[k]) ? mom[k] : null]);
  });
  return out;
}
