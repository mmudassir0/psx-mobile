/**
 * Two or three stocks side by side: the same figures Sahm shows on each stock
 * page, lined up, with the better value in each row marked. Rows that are a
 * matter of taste (price, size, sector) are not marked.
 */
import type { StockPack } from '../ai/context';
import { decide } from '../ai/verdict';
import { priceRange } from './range';

export type Better = 'high' | 'low' | null;

export interface CompareRow {
  group: 'Price' | 'Value' | 'Business' | 'Risk' | "Sahm's view" | 'About';
  label: string;
  /** shown under the label */
  hint?: string;
  /** one shown value per stock, '–' when unknown */
  values: string[];
  /** indexes of the stocks with the better value (ties share it); empty when not compared */
  best: number[];
}

export interface CompareInput {
  pack: StockPack;
  /** daily closes, oldest first */
  closes: number[];
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const pct = (v: number | null, d = 1) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const num = (v: number | null, d = 1) => (v == null ? '–' : v.toFixed(d));

function bestOf(vals: (number | null)[], better: Better): number[] {
  if (!better) return [];
  const known = vals.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => ok(x[0]));
  if (known.length < 2) return [];
  const target = better === 'high' ? Math.max(...known.map((k) => k[0])) : Math.min(...known.map((k) => k[0]));
  if (known.every((k) => Math.abs(k[0] - target) < 1e-9)) return [];
  return known.filter((k) => Math.abs(k[0] - target) < 1e-9).map((k) => k[1]);
}

/** Change over the last `n` sessions, in %. */
export function changeOver(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1 - n];
  const b = closes[closes.length - 1];
  return a > 0 && b > 0 ? (b / a - 1) * 100 : null;
}

/** The largest fall from a peak over the last `n` sessions, in % (a negative number). */
export function maxDrawdown(closes: number[], n = 250): number | null {
  const c = closes.slice(-n).filter((x) => x > 0);
  if (c.length < 20) return null;
  let peak = c[0];
  let worst = 0;
  for (const x of c) {
    peak = Math.max(peak, x);
    worst = Math.min(worst, x / peak - 1);
  }
  return worst * 100;
}

export function compareRows(items: CompareInput[]): CompareRow[] {
  const rows: CompareRow[] = [];
  const add = (group: CompareRow['group'], label: string, vals: (number | null)[], fmt: (v: number | null) => string, better: Better, hint?: string) => {
    const values = vals.map(fmt);
    let best = bestOf(vals, better);
    // a lead that disappears in rounding ("±14%" against "±14%") isn't one
    if (best.length) {
      const shown = values[best[0]];
      best = values.map((v, i) => [v, i] as const).filter(([v]) => v === shown).map(([, i]) => i);
      if (best.length === values.filter((v) => v !== '–').length) best = [];
    }
    rows.push({ group, label, hint, values, best });
  };
  const text = (group: CompareRow['group'], label: string, values: string[], hint?: string) => rows.push({ group, label, hint, values, best: [] });

  const P = items.map((x) => x.pack);
  const price = P.map((p) => p.stock?.price ?? p.company?.close ?? null);

  add('Price', 'Price', price, (v) => (v == null ? '–' : `Rs ${v >= 1000 ? v.toFixed(0) : v.toFixed(2)}`), null);
  add('Price', 'Today', P.map((p) => p.stock?.changePct ?? p.company?.changePct ?? null), (v) => pct(v, 2), null);
  add('Price', '1 month', items.map((x) => changeOver(x.closes, 21)), (v) => pct(v), 'high');
  add('Price', '1 year', items.map((x, i) => changeOver(x.closes, 250) ?? P[i].company?.change1y ?? P[i].stock?.change1y ?? null), (v) => pct(v), 'high', 'price only, before dividends');

  add('Value', 'P/E', P.map((p) => { const v = p.company?.pe ?? p.stock?.pe; return ok(v) && v > 0 ? v : null; }), (v) => num(v), 'low', 'lower is cheaper for each rupee of profit');
  add('Value', 'Price to book', P.map((p) => (p.balance && ok(p.ratios?.priceToBook) ? p.ratios!.priceToBook : null)), (v) => num(v, 2), 'low');
  add('Value', 'Dividend yield', P.map((p) => p.stock?.divYield ?? null), (v) => (v == null ? '–' : `${v.toFixed(1)}%`), 'high');
  add('Value', 'Fair value gap', P.map((p) => (p.fair ? p.fair.upside * 100 : null)), (v) => pct(v, 0), 'high', "Sahm's fair value against today's price");

  add('Business', 'Return on equity', P.map((p) => (p.balance && ok(p.ratios?.roe) ? p.ratios!.roe * 100 : null)), (v) => (v == null ? '–' : `${v.toFixed(0)}%`), 'high', 'profit for each rupee owners put in');
  add('Business', 'Earnings growth', P.map((p) => p.company?.ratios?.rows.find((r) => /eps growth/i.test(r.label))?.values[0] ?? null), (v) => pct(v, 0), 'high', 'last year');
  add('Business', 'Debt to equity', P.map((p) => (p.balance && !p.balance.isBank && ok(p.ratios?.debtToEquity) ? p.ratios!.debtToEquity : null)), (v) => num(v, 2), 'low', 'not shown for banks');
  add('Business', 'Dividend cover', P.map((p) => (ok(p.ratios?.dividendCover) ? p.ratios!.dividendCover : null)), (v) => (v == null ? '–' : `${v.toFixed(1)}×`), 'high', 'profit ÷ dividends paid; under 1 can\'t last');

  add('Risk', 'Likely move in a month', items.map((x) => { const r = priceRange(x.closes, 21); return r ? r.pct * 100 : null; }), (v) => (v == null ? '–' : `±${v.toFixed(0)}%`), 'low', '80% range: smaller is calmer');
  add('Risk', 'Worst fall in a year', items.map((x) => maxDrawdown(x.closes)), (v) => pct(v, 0), 'high', 'from a high to the low after it');
  add('Risk', 'Market value', P.map((p) => { const v = p.company?.marketCap ?? p.stock?.marketCap; return ok(v) ? v / 1e9 : null; }), (v) => (v == null ? '–' : v >= 1000 ? `Rs ${(v / 1000).toFixed(1)} T` : `Rs ${v.toFixed(0)} B`), null);

  const verdicts = P.map((p) => decide(p));
  add("Sahm's view", 'Technical score', P.map((p) => (ok(p.analysis?.score) ? p.analysis!.score : null)), (v) => (v == null ? '–' : `${v.toFixed(1)}/10`), 'high');
  text("Sahm's view", 'Verdict', verdicts.map((v) => (v ? `${v.call}${v.confidence === 'Low' ? ', unsure' : ''}` : '–')));

  text('About', 'Sector', P.map((p) => p.stock?.sector ?? p.company?.sector ?? '–'));
  text('About', 'In the KSE-100', P.map((p) => (p.stock?.indexes.includes('KSE100') ? 'Yes' : 'No')));
  text('About', 'Shariah', P.map((p) => (p.stock?.indexes.includes('KMI30') ? 'KMI-30' : p.stock?.shariah ? 'Yes' : 'No')));
  return rows;
}

/** The closes of each stock rebased to 100 on the first day all of them traded, over the last `n` sessions. */
export function rebased(series: { t: number; c: number }[][], n = 250): { t: number; v: number[] }[] {
  if (!series.length || series.some((s) => !s.length)) return [];
  const day = (t: number) => Math.floor((t + 5 * 3600_000) / 864e5);
  const maps = series.map((s) => new Map(s.map((b) => [day(b.t), b.c])));
  const days = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort((a, b) => a - b).slice(-n);
  if (days.length < 2) return [];
  const base = maps.map((m) => m.get(days[0])!);
  return days.map((d) => ({ t: d * 864e5, v: maps.map((m, i) => (m.get(d)! / base[i]) * 100) }));
}
