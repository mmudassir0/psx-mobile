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
