/**
 * Builds the lab's data file from the daily job's saved history: closes on one
 * calendar, average traded value by month, cash dividends and yearly earnings.
 * Pure (the job does the reading and fetching), so it's tested on fixtures.
 */
import { delta, type LabFile, type LabFileStock } from './data';

export type Bar = [t: number, o: number, h: number, l: number, c: number, v: number];

export interface BuildStock {
  symbol: string;
  sector: string;
  kse100: boolean;
  kmi30: boolean;
  shariah: boolean;
  /** daily bars, adjusted for bonus issues and splits */
  bars: Bar[];
  /** cash dividends: ex-date YYYY-MM-DD and Rs per share in today's (adjusted) shares */
  divs: { day: string; dps: number }[];
  /** yearly EPS in today's shares, with the day it became known */
  eps: { day: string; eps: number }[];
}

export interface BuildInput {
  built: string;
  /** index closes by trading day, YYYY-MM-DD */
  index: { KSE100: Map<string, number>; KMI30: Map<string, number> };
  stocks: BuildStock[];
  divFrom: string;
  /** keep stocks that traded at least this much a day (Rs) in some month */
  minValue?: number;
  max?: number;
}

export const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const dayNum = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / 864e5);

export function buildLab(inp: BuildInput): LabFile {
  const days = [...inp.index.KSE100.keys()].sort();
  const at = new Map(days.map((d, i) => [d, i]));
  const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  const ym0 = ym(days[0]);
  const months = ym(days[days.length - 1]) - ym0 + 1;
  /** first calendar day on or after `d` */
  const onOrAfter = (d: string) => {
    let lo = 0,
      hi = days.length - 1,
      r = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (days[m] >= d) {
        r = m;
        hi = m - 1;
      } else lo = m + 1;
    }
    return r;
  };

  const rows: { s: LabFileStock; peak: number }[] = [];
  for (const st of inp.stocks) {
    const bars = st.bars.filter((b) => b[4] > 0).map((b) => ({ d: pkDay(b[0]), c: b[4], v: b[5] }));
    const byDay = new Map(bars.map((b) => [b.d, b]));
    const first = bars.length ? onOrAfter(bars[0].d) : -1;
    if (first < 0 || days.length - first < 60) continue;
    const closes: number[] = [];
    const tvSum = new Array<number>(months).fill(0);
    const tvN = new Array<number>(months).fill(0);
    let last = 0;
    for (let i = first; i < days.length; i++) {
      const b = byDay.get(days[i]);
      if (b) last = Math.round(b.c * 100);
      closes.push(last);
      const m = ym(days[i]) - ym0;
      tvN[m]++;
      if (b) tvSum[m] += b.c * b.v;
    }
    if (!last) continue;
    // a one-day jump no trading limit allows, on a stock above Rs 15, is a bonus, split or rights issue the
    // adjusted prices missed: carry the change back so it doesn't count as a gain or a loss
    for (let i = closes.length - 1; i >= 1; i--) {
      const a = closes[i - 1];
      const r = closes[i] / a;
      if (a >= 1500 && (r < 0.62 || r > 1.6)) for (let j = 0; j < i; j++) closes[j] = Math.round(closes[j] * r);
    }
    const tv = tvSum.map((v, m) => (tvN[m] ? Math.round(v / tvN[m] / 1000) : 0));
    const peak = Math.max(...tv) * 1000;
    if (peak < (inp.minValue ?? 0)) continue;
    // trailing zeros of months before listing stay as 0
    const dv: [number, number][] = [];
    for (const d of st.divs) {
      const i = onOrAfter(d.day);
      if (i >= first && d.dps > 0) dv.push([i, Math.round(d.dps * 100)]);
    }
    const ep: [number, number][] = [];
    for (const e of st.eps) {
      const i = onOrAfter(e.day);
      if (i >= 0 && Number.isFinite(e.eps)) ep.push([i, Math.round(e.eps * 100)]);
    }
    dv.sort((a, b) => a[0] - b[0]);
    ep.sort((a, b) => a[0] - b[0]);
    rows.push({
      s: {
        s: st.symbol,
        sec: st.sector,
        f: `${st.kse100 ? 'k' : ''}${st.kmi30 ? 'm' : ''}${st.shariah ? 's' : ''}`,
        at: first,
        c: delta(closes),
        tv,
        dv,
        ep,
      },
      peak,
    });
  }
  rows.sort((a, b) => b.peak - a.peak);
  const keep = rows.slice(0, inp.max ?? 400).map((r) => r.s);
  keep.sort((a, b) => (a.s < b.s ? -1 : 1));
  const ix = (m: Map<string, number>) => {
    let lastV = 0;
    return delta(
      days.map((d) => {
        const v = m.get(d);
        if (v) lastV = Math.round(v);
        return lastV;
      }),
    );
  };
  return {
    v: 1,
    kind: 'lab',
    built: inp.built,
    d0: days[0],
    dd: days.map((d, i) => (i === 0 ? 0 : dayNum(d) - dayNum(days[i - 1]))),
    ix: { KSE100: ix(inp.index.KSE100), KMI30: ix(inp.index.KMI30) },
    stocks: keep,
    divFrom: inp.divFrom,
  };
}
