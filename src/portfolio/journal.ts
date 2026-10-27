/**
 * Search your own notes and trades in ordinary words: "why did I buy LUCK",
 * "banks", "dividend", "sold last year". Symbols in the question narrow it to
 * those stocks; the other words are looked for in your notes.
 */

export interface JournalNote {
  symbol: string;
  why: string;
  at: number;
  checkOn: string | null;
  then: { price: number | null; divYield: number | null; pe: number | null };
}

export interface JournalTrade {
  day: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  realised: number | null;
}

export type Hit = { kind: 'note'; day: string; symbol: string; note: JournalNote; score: number } | { kind: 'trade'; day: string; symbol: string; trade: JournalTrade; score: number };

const STOP = new Set(
  'a an and are at be by did do does for from had has have how i in is it me my of on or so that the this to was what when where which who why with you your about did bought buy sold sell sale shares share stock stocks'.split(
    ' ',
  ),
);
const SIDE: Record<string, 'buy' | 'sell'> = { buy: 'buy', bought: 'buy', buying: 'buy', sell: 'sell', sold: 'sell', selling: 'sell', sale: 'sell' };

export interface Query {
  symbols: string[];
  words: string[];
  side: 'buy' | 'sell' | null;
  /** a year named, e.g. 2025 */
  year: string | null;
}

export function parseQuery(q: string, known: Set<string>): Query {
  const raw = q.toLowerCase().match(/[a-z0-9&]+/g) ?? [];
  const symbols: string[] = [];
  const words: string[] = [];
  let side: 'buy' | 'sell' | null = null;
  let year: string | null = null;
  for (const w of raw) {
    const up = w.toUpperCase();
    if (known.has(up)) symbols.push(up);
    else if (/^20\d\d$/.test(w)) year = w;
    else {
      if (SIDE[w]) side = SIDE[w];
      if (!STOP.has(w) && w.length > 1) words.push(w);
    }
  }
  return { symbols: [...new Set(symbols)], words, side, year };
}

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');

export function searchJournal(q: string, notes: JournalNote[], trades: JournalTrade[], known: Set<string>): { query: Query; hits: Hit[] } {
  const query = parseQuery(q, known);
  const hits: Hit[] = [];
  const bySym = (s: string) => !query.symbols.length || query.symbols.includes(s);
  const inYear = (day: string) => !query.year || day.startsWith(query.year);
  const stems = query.words.map(stem);
  for (const n of notes) {
    if (!bySym(n.symbol)) continue;
    const day = pkDay(n.at);
    if (!inYear(day)) continue;
    const text = n.why.toLowerCase();
    const matched = stems.filter((w) => text.includes(w)).length;
    // with symbols only, every note of theirs; with words, notes that use one of them
    if (stems.length && !matched && !query.symbols.length) continue;
    hits.push({ kind: 'note', day, symbol: n.symbol, note: n, score: 10 + matched * 5 + (query.symbols.includes(n.symbol) ? 5 : 0) });
  }
  // trades have no text: they come with a symbol, a side or a year
  if (query.symbols.length || query.side || query.year)
    for (const t of trades) {
      if (!bySym(t.symbol) || !inYear(t.day)) continue;
      if (query.side && t.side !== query.side) continue;
      hits.push({ kind: 'trade', day: t.day, symbol: t.symbol, trade: t, score: 5 });
    }
  hits.sort((a, b) => b.score - a.score || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return { query, hits };
}
