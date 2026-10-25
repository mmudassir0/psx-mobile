/**
 * Price alerts on any stock, checked by the evening job against the close.
 * Rules are plain text kept in the WATCH_ALERTS repository secret, e.g.
 *   SYS<100, MEBL>600, LUCK>200d, PPL<200d
 * "<" / ">" a price, or the 200-day average ("200d"). An alert is sent the
 * evening the close crosses the line, not every day it stays past it.
 */
export interface WatchRule {
  symbol: string;
  dir: '<' | '>';
  /** a price, or 'ma200' for the 200-day average */
  level: number | 'ma200';
}

export function parseRules(text: string): { rules: WatchRule[]; bad: string[] } {
  const rules: WatchRule[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = raw.toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9-]{2,12})([<>])(\d+(?:\.\d+)?|200D)$/);
    if (!m) {
      bad.push(raw);
      continue;
    }
    rules.push({ symbol: m[1], dir: m[2] as '<' | '>', level: m[3] === '200D' ? 'ma200' : Number(m[3]) });
  }
  return { rules, bad };
}

export const ruleText = (r: WatchRule) => `${r.symbol}${r.dir}${r.level === 'ma200' ? '200d' : r.level}`;
export const rulesText = (rs: WatchRule[]) => rs.map(ruleText).join(', ');

export const describeRule = (r: WatchRule) =>
  `${r.symbol} closes ${r.dir === '<' ? 'below' : 'above'} ${r.level === 'ma200' ? 'its 200-day average' : `Rs ${r.level}`}`;

const sma = (c: number[], n: number, end: number) => {
  if (end + 1 < n) return null;
  let s = 0;
  for (let k = end - n + 1; k <= end; k++) s += c[k];
  return s / n;
};

/** Whether the rule is met at bar i (closes only). */
export function ruleMet(r: WatchRule, closes: number[], i: number): boolean | null {
  const line = r.level === 'ma200' ? sma(closes, 200, i) : r.level;
  if (line == null || i < 0) return null;
  return r.dir === '<' ? closes[i] < line : closes[i] > line;
}

/** True when the last close crossed the line (met now, not met the session before). */
export function crossedToday(r: WatchRule, closes: number[]): boolean {
  const n = closes.length - 1;
  const now = ruleMet(r, closes, n);
  const before = ruleMet(r, closes, n - 1);
  return now === true && before === false;
}
