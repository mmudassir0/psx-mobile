/**
 * "Why did it move?": a stock's biggest days in the last year, each with what Sahm can see behind
 * it — a notice from the company that day or just before, the whole market moving the same way,
 * the stock going ex-dividend, or unusually heavy trading. No phone APIs, for the tests.
 */
import type { Announcement, Candle } from '../psx/types';
import { kindOf, KIND_LABEL } from './announcements';

export interface Reason {
  kind: 'notice' | 'market' | 'exdate' | 'volume' | 'none';
  text: string;
  url?: string | null;
}

export interface BigDay {
  day: string;
  /** close against the day before, as a fraction */
  pct: number;
  close: number;
  reasons: Reason[];
}

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const back = (day: string, n: number) => new Date(Date.parse(day + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);

export function bigDays(
  candles: Candle[],
  ctx: {
    announcements?: Announcement[];
    /** the KSE-100's closes, to tell a market-wide day from the stock's own */
    index?: { t: number; v: number }[];
    /** ex-dividend days (YYYY-MM-DD) with what was paid, e.g. "Rs 5 dividend" */
    exDays?: { day: string; what: string }[];
    /** how far back, in trading days */
    span?: number;
    /** smallest move counted, as a fraction */
    min?: number;
    max?: number;
  } = {},
): BigDay[] {
  const span = ctx.span ?? 250;
  const min = ctx.min ?? 0.04;
  const max = ctx.max ?? 8;
  const from = Math.max(1, candles.length - span);
  const idx = new Map<string, number>();
  const ix = ctx.index ?? [];
  for (let i = 1; i < ix.length; i++) if (ix[i - 1].v > 0) idx.set(pkDay(ix[i].t), ix[i].v / ix[i - 1].v - 1);
  const days: BigDay[] = [];
  for (let i = from; i < candles.length; i++) {
    const a = candles[i - 1].c;
    const b = candles[i].c;
    if (!(a > 0 && b > 0)) continue;
    const pct = b / a - 1;
    // half or more in a day is a split, bonus adjustment or data slip, not a move
    if (Math.abs(pct) < min || Math.abs(pct) >= 0.5) continue;
    days.push({ day: pkDay(candles[i].t), pct, close: b, reasons: [] });
    // normal volume: the 20 days before
    const vols = candles.slice(Math.max(0, i - 20), i).map((c) => c.v).filter((v) => v > 0);
    const normal = vols.length >= 5 ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
    const d = days[days.length - 1];
    const prev = back(d.day, 4);
    for (const n of ctx.announcements ?? []) {
      // a notice on the day, or in the few days before it (results often land after the close)
      if (n.date > d.day || n.date < prev) continue;
      const k = kindOf(n);
      d.reasons.push({ kind: 'notice', text: `${KIND_LABEL[k]}${n.date === d.day ? ' that day' : ` on ${n.date.slice(8)}/${n.date.slice(5, 7)}`}: ${n.title}`, url: n.url });
    }
    const ex = (ctx.exDays ?? []).find((e) => e.day === d.day);
    if (ex && pct < 0) d.reasons.push({ kind: 'exdate', text: `Went ex-dividend (${ex.what}): the price drops by about the payout. Not a loss.` });
    const m = idx.get(d.day);
    if (m != null && Math.abs(m) >= 0.015 && Math.sign(m) === Math.sign(pct))
      d.reasons.push({ kind: 'market', text: `The whole market moved: KSE-100 ${m >= 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)}% that day.` });
    if (normal > 0 && candles[i].v >= 3 * normal) d.reasons.push({ kind: 'volume', text: `Heavy trading: ${(candles[i].v / normal).toFixed(1)}× the usual volume.` });
    if (!d.reasons.length) d.reasons.push({ kind: 'none', text: 'Nothing on PSX that day: likely news, a sector move or a big buyer or seller.' });
  }
  // the biggest moves, newest first
  return days
    .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct))
    .slice(0, max)
    .sort((x, y) => y.day.localeCompare(x.day));
}
