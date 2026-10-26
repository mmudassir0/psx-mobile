/**
 * Price alerts on any stock, checked by the evening job against the close.
 * Rules are plain text kept in the WATCH_ALERTS repository secret, e.g.
 *   SYS<100, MEBL>600, LUCK>200d, PPL<200d, MEBL yield>9, LUCK<fair
 * "<" / ">" a price, the 200-day average ("200d"), the dividend yield in %
 * ("yield>9": the last 12 months' cash dividends against the close), or
 * Sahm's fair value range ("<fair": below its low end; ">fair": above its
 * high end). An alert is sent the evening the close crosses the line, not
 * every day it stays past it.
 */
export interface WatchRule {
  symbol: string;
  dir: '<' | '>';
  /** a price, 'ma200' for the 200-day average, 'fair' for Sahm's fair value range, or the yield in % when `yield` is set */
  level: number | 'ma200' | 'fair';
  /** the number is a dividend yield in %, not a price */
  yield?: boolean;
}

/** What some rules need besides the closes: the last 12 months' cash dividends a share, and the fair value range. */
export interface RuleContext {
  ttmDps?: number | null;
  fair?: { low: number; high: number } | null;
}

export function parseRules(text: string): { rules: WatchRule[]; bad: string[] } {
  const rules: WatchRule[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = raw.toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9-]{2,12}?)(YIELD)?([<>])(\d+(?:\.\d+)?|200D|FAIR)%?$/);
    // a yield needs a number; the 200-day average and fair value don't take "yield"
    if (!m || (m[2] && !/^\d/.test(m[4])) || m[1].endsWith('YIELD')) {
      bad.push(raw);
      continue;
    }
    const level = m[4] === '200D' ? 'ma200' : m[4] === 'FAIR' ? 'fair' : Number(m[4]);
    rules.push(m[2] ? { symbol: m[1], dir: m[3] as '<' | '>', level, yield: true } : { symbol: m[1], dir: m[3] as '<' | '>', level });
  }
  return { rules, bad };
}

/** The price a plain price rule watches, or null for the other kinds. */
export const priceLine = (r: WatchRule): number | null => (!r.yield && typeof r.level === 'number' ? r.level : null);

export const ruleText = (r: WatchRule) => `${r.symbol}${r.yield ? ' yield' : ''}${r.dir}${r.level === 'ma200' ? '200d' : r.level}`;
export const rulesText = (rs: WatchRule[]) => rs.map(ruleText).join(', ');

export const describeRule = (r: WatchRule) =>
  r.yield
    ? `${r.symbol}'s dividend yield goes ${r.dir === '<' ? 'below' : 'above'} ${r.level}%`
    : r.level === 'fair'
      ? `${r.symbol} closes ${r.dir === '<' ? "below Sahm's fair value range" : "above Sahm's fair value range"}`
      : `${r.symbol} closes ${r.dir === '<' ? 'below' : 'above'} ${r.level === 'ma200' ? 'its 200-day average' : `Rs ${r.level}`}`;

const sma = (c: number[], n: number, end: number) => {
  if (end + 1 < n) return null;
  let s = 0;
  for (let k = end - n + 1; k <= end; k++) s += c[k];
  return s / n;
};

/** Whether the rule is met at bar i. Yield and fair-value rules need `ctx`; without it they can't be judged (null). */
export function ruleMet(r: WatchRule, closes: number[], i: number, ctx: RuleContext = {}): boolean | null {
  if (i < 0 || !(closes[i] > 0)) return null;
  if (r.yield) {
    if (!(ctx.ttmDps != null && ctx.ttmDps >= 0)) return null;
    const y = (ctx.ttmDps / closes[i]) * 100;
    return r.dir === '<' ? y < (r.level as number) : y > (r.level as number);
  }
  if (r.level === 'fair') {
    if (!ctx.fair) return null;
    return r.dir === '<' ? closes[i] < ctx.fair.low : closes[i] > ctx.fair.high;
  }
  const line = r.level === 'ma200' ? sma(closes, 200, i) : r.level;
  if (line == null) return null;
  return r.dir === '<' ? closes[i] < line : closes[i] > line;
}

/** True when the last close crossed the line (met now, not met the session before). */
export function crossedToday(r: WatchRule, closes: number[], ctx: RuleContext = {}): boolean {
  const n = closes.length - 1;
  const now = ruleMet(r, closes, n, ctx);
  const before = ruleMet(r, closes, n - 1, ctx);
  return now === true && before === false;
}
