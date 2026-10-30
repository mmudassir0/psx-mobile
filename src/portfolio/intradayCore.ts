/**
 * Alerts during market hours: each check compares the price now with the price
 * at the last check, and a line crossed in between (your price alerts, target
 * and rethink prices, and chart levels) is news. No phone APIs, for the tests.
 */

export interface PriceLine {
  symbol: string;
  level: number;
  /** only a cross in this direction counts ('<' falling through, '>' rising through), or either */
  dir: '<' | '>' | 'any';
  label: string;
}

export interface Hit {
  key: string;
  symbol: string;
  text: string;
}

export function intradayHits(lines: PriceLine[], prev: Record<string, number>, now: Record<string, number>, sent: Set<string>, day: string): Hit[] {
  const out: Hit[] = [];
  for (const l of lines) {
    const a = prev[l.symbol];
    const b = now[l.symbol];
    if (!(a > 0 && b > 0)) continue;
    const down = a > l.level && b <= l.level;
    const up = a < l.level && b >= l.level;
    if (!(down && l.dir !== '>') && !(up && l.dir !== '<')) continue;
    const key = `${day}:${l.symbol}:${l.label}:${l.level}`;
    if (sent.has(key)) continue;
    out.push({ key, symbol: l.symbol, text: `${l.symbol} ${down ? 'fell below' : 'rose above'} ${l.label} (Rs ${l.level.toFixed(2)}): Rs ${b.toFixed(2)} now` });
  }
  return out;
}

/** A holding moving a lot today (`changePct` in percent, as PSX gives it): once per stock, direction and day. */
export function bigMoveHits(symbols: string[], board: { symbol: string; price: number | null; changePct: number | null }[], threshold: number, sent: Set<string>, day: string): Hit[] {
  if (!(threshold > 0)) return [];
  const mine = new Set(symbols);
  const out: Hit[] = [];
  for (const b of board) {
    if (!mine.has(b.symbol) || b.changePct == null || !(b.price! > 0)) continue;
    // over 50% in a day is a data slip, not news
    if (Math.abs(b.changePct) < threshold || Math.abs(b.changePct) >= 50) continue;
    const up = b.changePct > 0;
    const key = `${day}:${b.symbol}:move:${up ? 'up' : 'down'}`;
    if (sent.has(key)) continue;
    out.push({ key, symbol: b.symbol, text: `${b.symbol} is ${up ? 'up' : 'down'} ${Math.abs(b.changePct).toFixed(1)}% today: Rs ${b.price!.toFixed(2)}` });
  }
  return out;
}

/** The evening line: what your holdings did today, in rupees and percent, with the best and worst. */
export function daySummary(holdings: { symbol: string; shares: number }[], board: { symbol: string; price: number | null; ldcp: number | null; changePct: number | null }[]): { title: string; body: string } | null {
  const by = new Map(board.map((b) => [b.symbol, b]));
  let now = 0;
  let before = 0;
  const moves: { symbol: string; pct: number }[] = [];
  for (const h of holdings) {
    const b = by.get(h.symbol);
    if (!b?.price || !b.ldcp || !(h.shares > 0)) continue;
    // a move of half or more in a day is a data slip: count the stock as flat
    const price = Math.abs(b.price / b.ldcp - 1) >= 0.5 ? b.ldcp : b.price;
    now += price * h.shares;
    before += b.ldcp * h.shares;
    moves.push({ symbol: h.symbol, pct: (price / b.ldcp - 1) * 100 });
  }
  if (!(before > 0) || !moves.length) return null;
  const diff = now - before;
  const pct = (diff / before) * 100;
  const sign = (v: number) => (v >= 0 ? '+' : '−');
  const rs = `${sign(diff)}Rs ${Math.round(Math.abs(diff)).toLocaleString('en-US')}`;
  moves.sort((a, b) => b.pct - a.pct);
  const best = moves[0];
  const worst = moves[moves.length - 1];
  const parts = [`Your holdings ${diff >= 0 ? 'gained' : 'lost'} ${rs.replace(/^[+−]/, '')} (${sign(pct)}${Math.abs(pct).toFixed(2)}%) today.`];
  if (moves.length > 1) parts.push(`Best ${best.symbol} ${sign(best.pct)}${Math.abs(best.pct).toFixed(1)}%, weakest ${worst.symbol} ${sign(worst.pct)}${Math.abs(worst.pct).toFixed(1)}%.`);
  return { title: `Today ${rs} (${sign(pct)}${Math.abs(pct).toFixed(2)}%)`, body: parts.join(' ') };
}
