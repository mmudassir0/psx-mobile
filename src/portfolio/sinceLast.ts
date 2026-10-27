/**
 * "Since you last looked": what changed between the last time you left Sahm and
 * now, from prices saved when you left (on the shares you hold now, so trades
 * don't count as gains), plus announcements and book closures in between.
 */

export interface LastLook {
  at: number;
  /** symbol → price when you left */
  prices: Record<string, number>;
}

export interface SinceLast {
  hours: number;
  change: number;
  pct: number;
  movers: { symbol: string; pct: number; held: boolean }[];
  news: { symbol: string; title: string }[];
  bookClosures: { symbol: string; day: string }[];
}

/** Worth showing after this long away. */
export const AWAY_HOURS = 3;

const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function sinceLast(input: {
  last: LastLook | null;
  now: number;
  holdings: { symbol: string; shares: number }[];
  watchlist: string[];
  price: (s: string) => number | null;
  announcements: Record<string, { date: string; title: string }[]>;
  payouts: Record<string, { bookClosure: number | null }[]>;
}): SinceLast | null {
  const L = input.last;
  if (!L || input.now - L.at < AWAY_HOURS * 3600_000) return null;
  let before = 0;
  let after = 0;
  for (const h of input.holdings) {
    const p0 = L.prices[h.symbol];
    const p1 = input.price(h.symbol);
    if (!p0 || !p1) continue;
    before += p0 * h.shares;
    after += p1 * h.shares;
  }
  const held = new Set(input.holdings.map((h) => h.symbol));
  const movers = [...new Set([...input.holdings.map((h) => h.symbol), ...input.watchlist])]
    .map((s) => ({ symbol: s, p0: L.prices[s], p1: input.price(s) }))
    .filter((x) => x.p0 && x.p1)
    .map((x) => ({ symbol: x.symbol, pct: x.p1! / x.p0 - 1, held: held.has(x.symbol) }))
    .filter((x) => Math.abs(x.pct) >= 0.02)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 4);
  const fromDay = pk(L.at);
  const news: SinceLast['news'] = [];
  for (const [s, list] of Object.entries(input.announcements)) for (const a of list) if (a.date >= fromDay) news.push({ symbol: s, title: a.title });
  const bookClosures: SinceLast['bookClosures'] = [];
  for (const [s, list] of Object.entries(input.payouts))
    for (const p of list) if (p.bookClosure != null && p.bookClosure > L.at && p.bookClosure <= input.now) bookClosures.push({ symbol: s, day: pk(p.bookClosure) });
  const change = after - before;
  const r = { hours: (input.now - L.at) / 3600_000, change, pct: before ? change / before : 0, movers, news: news.slice(0, 6), bookClosures };
  // nothing to say: no card
  return Math.abs(r.pct) < 0.001 && !movers.length && !news.length && !bookClosures.length ? null : r;
}

export function awayLabel(hours: number): string {
  if (hours < 24) return `${Math.round(hours)} hours`;
  const d = Math.round(hours / 24);
  return d === 1 ? 'a day' : `${d} days`;
}
