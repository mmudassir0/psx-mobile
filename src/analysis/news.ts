/**
 * Business news headlines from Pakistani outlets' public RSS feeds, tagged to
 * the PSX companies they mention. Only the headline, a short snippet, the
 * source and the link are kept; the story itself opens on the publisher's site.
 */

export const NEWS_FEEDS: { source: string; url: string }[] = [
  { source: 'Business Recorder', url: 'https://www.brecorder.com/feeds/markets' },
  { source: 'Dawn', url: 'https://www.dawn.com/feeds/business' },
  { source: 'Express Tribune', url: 'https://tribune.com.pk/feed/business' },
  { source: 'ProPakistani', url: 'https://propakistani.pk/category/business/feed/' },
];

export interface RawItem {
  title: string;
  url: string;
  t: number;
  snippet: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (x: string, t: string) => x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i'))?.[1] ?? '';

export function parseRss(xml: string): RawItem[] {
  const out: RawItem[] = [];
  for (const it of xml.split(/<item[\s>]/i).slice(1)) {
    const title = decode(tag(it, 'title'));
    const url = decode(tag(it, 'link')) || decode(tag(it, 'guid'));
    const t = Date.parse(decode(tag(it, 'pubDate')));
    const snippet = decode(tag(it, 'description')).slice(0, 220);
    if (title && /^https?:\/\//.test(url) && Number.isFinite(t)) out.push({ title, url, t, snippet });
  }
  return out;
}

// ------------------------------------------------------------- matching ----

/** Common names a company goes by in the press, beyond its PSX name. */
export const ALIASES: Record<string, string[]> = {
  OGDC: ['OGDCL', 'Oil and Gas Development', 'Oil & Gas Development'],
  PPL: ['Pakistan Petroleum'],
  MARI: ['Mari Energies', 'Mari Petroleum'],
  HUBC: ['Hubco', 'Hub Power'],
  LUCK: ['Lucky Cement'],
  DGKC: ['DG Khan Cement', 'D.G. Khan Cement'],
  FFC: ['Fauji Fertilizer Company', 'Fauji Fertiliser'],
  EFERT: ['Engro Fertilizers', 'Engro Fertilisers'],
  ENGROH: ['Engro Holdings', 'Engro Corporation', 'Engro Corp'],
  SYS: ['Systems Limited', 'Systems Ltd'],
  MEBL: ['Meezan Bank'],
  GLAXO: ['GSK Pakistan', 'GlaxoSmithKline'],
  SEARL: ['Searle'],
  AIRLINK: ['Air Link', 'Airlink Communication'],
  SAZEW: ['Sazgar'],
  PRL: ['Pakistan Refinery'],
  PSO: ['Pakistan State Oil'],
  SNGP: ['SNGPL', 'Sui Northern'],
  SSGC: ['SSGCL', 'Sui Southern'],
  MCB: ['MCB Bank'],
  HBL: ['Habib Bank'],
  UBL: ['United Bank'],
  NBP: ['National Bank of Pakistan'],
  BAFL: ['Bank Alfalah'],
  BAHL: ['Bank AL Habib', 'Bank Al-Habib'],
  MTL: ['Millat Tractors'],
  INDU: ['Indus Motor', 'Toyota Indus'],
  HCAR: ['Honda Atlas Cars'],
  PSMC: ['Pak Suzuki', 'Pakistan Suzuki'],
  ATRL: ['Attock Refinery'],
  NRL: ['National Refinery'],
  KEL: ['K-Electric', 'KElectric'],
  TRG: ['TRG Pakistan'],
  PTC: ['PTCL'],
  FCCL: ['Fauji Cement'],
  MLCF: ['Maple Leaf Cement'],
  CHCC: ['Cherat Cement'],
  KOHC: ['Kohat Cement'],
  PIOC: ['Pioneer Cement'],
  NML: ['Nishat Mills'],
  ILP: ['Interloop'],
  POL: ['Pakistan Oilfields'],
  APL: ['Attock Petroleum'],
  CNERGY: ['Cnergyico'],
};

/** Market-wide stories worth showing even when they name no company. */
export const MARKET_WORDS =
  /\b(PSX|KSE[- ]?100|KMI[- ]?30|stock (market|exchange)|bourse|equities|shares (rose|fell|gain|lose|close)|SBP|State Bank|policy rate|interest rate|monetary policy|MPC|IMF|inflation|CPI|rupee|dollar rate|forex reserves|current account|remittances|budget|circular debt|T-?bills?|PIBs?|sukuk|petrol price|fuel prices?|gas prices?|electricity tariff|exports|imports|trade deficit|GDP|growth rate|Moody|Fitch|S&P)\b/i;

const GENERIC = new Set(['pakistan', 'limited', 'ltd', 'company', 'co', 'corporation', 'corp', 'industries', 'the', 'and', '&', 'of', 'mills', 'bank', 'pak', 'international', 'group', 'holdings', 'textile', 'textiles', 'investment', 'investments', 'fund']);

/** The distinctive start of a PSX company name, e.g. "Lucky Cement Limited" → "Lucky Cement". */
export function coreName(name: string): string | null {
  const words = name.replace(/\(.*?\)/g, ' ').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (/^(limited|ltd|plc)$/i.test(w)) break;
    kept.push(w);
    if (kept.length === 3) break;
  }
  const meaningful = kept.filter((w) => !GENERIC.has(w.toLowerCase()));
  if (!meaningful.length) return null;
  const core = kept.join(' ');
  // one short or common word alone ("Lucky", "Crescent") is too likely to match something else
  if (kept.length < 2 && core.length < 8) return null;
  return core.length >= 6 ? core : null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Matcher {
  match: (text: string) => string[];
}

/** Matches company names, aliases and (for symbols of 3+ letters written in capitals) the symbol itself. */
export function buildMatcher(companies: { symbol: string; name: string }[]): Matcher {
  const rules: { symbol: string; re: RegExp }[] = [];
  for (const c of companies) {
    const names = [...(ALIASES[c.symbol] ?? [])];
    const core = coreName(c.name);
    if (core) names.push(core);
    for (const n of names) rules.push({ symbol: c.symbol, re: new RegExp(`(^|[^A-Za-z])${esc(n)}(?![A-Za-z])`, 'i') });
    // the bare symbol, case-sensitive, only when it isn't an ordinary word
    if (c.symbol.length >= 3 && !/^(THE|AND|FOR|NEW|ONE|ALL|NOW|OUT|TOP|BIG|SUN|NET|PAK|LOW|HIGH|LIFE|PACE|STAR|MOON|FAST|GOOD|GOLD|PRIME|PEACE|TREND|HOME|POWER)$/.test(c.symbol))
      rules.push({ symbol: c.symbol, re: new RegExp(`(^|[^A-Za-z])${esc(c.symbol)}(?![A-Za-z])`) });
  }
  return {
    match: (text: string) => [...new Set(rules.filter((r) => r.re.test(text)).map((r) => r.symbol))],
  };
}

// ---------------------------------------------------------------- feed ----

/** [epoch ms, source index, title, url, symbols, market-wide] */
export type NewsRow = [number, number, string, string, string[], boolean];

export interface NewsFeed {
  v: 1;
  kind: 'news';
  generatedAt: string;
  sources: string[];
  rows: NewsRow[];
}

export interface NewsItem {
  t: number;
  source: string;
  title: string;
  url: string;
  symbols: string[];
  market: boolean;
}

export const isNewsFeed = (x: unknown): x is NewsFeed => {
  const f = x as NewsFeed | null;
  return !!f && f.v === 1 && f.kind === 'news' && Array.isArray(f.rows) && Array.isArray(f.sources);
};

export function newsItems(f: NewsFeed | null): NewsItem[] {
  if (!f) return [];
  return f.rows
    .filter((r) => Array.isArray(r) && typeof r[2] === 'string' && /^https?:\/\//.test(r[3]))
    .map(([t, s, title, url, symbols, market]) => ({ t, source: f.sources[s] ?? '', title, url, symbols: symbols ?? [], market: !!market }))
    .sort((a, b) => b.t - a.t);
}

/** Classifies and de-duplicates collected items (the same story often appears in two feeds). */
export function buildNews(collected: { source: number; item: RawItem }[], matcher: Matcher, now: number, days = 5): NewsRow[] {
  const seen = new Set<string>();
  const rows: NewsRow[] = [];
  for (const { source, item } of collected.sort((a, b) => b.item.t - a.item.t)) {
    if (now - item.t > days * 864e5 || item.t > now + 3600_000) continue;
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
    if (seen.has(key) || seen.has(item.url)) continue;
    const symbols = matcher.match(item.title + ' ' + item.snippet);
    const market = MARKET_WORDS.test(item.title);
    if (!symbols.length && !market) continue;
    seen.add(key);
    seen.add(item.url);
    rows.push([item.t, source, item.title, item.url, symbols, market]);
  }
  return rows.slice(0, 200);
}
