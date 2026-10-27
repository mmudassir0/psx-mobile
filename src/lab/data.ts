/**
 * The backtesting lab's data: ten years of daily closes for the liquid PSX
 * stocks, built by the daily job and downloaded once to the phone.
 *
 * On disk (lab.json) closes are whole paisa, delta-encoded, so the file stays
 * small; `decodeLab` turns it into plain arrays aligned to one calendar.
 * Closes are adjusted for bonus issues and splits (PSX's own adjusted series,
 * and price gaps where that doesn't reach), so a bonus doesn't look like a
 * crash. Cash dividends are kept separately, in the same adjusted rupees.
 */

export interface LabFileStock {
  s: string;
  /** sector name as PSX writes it */
  sec: string;
  /** flags: k KSE-100 now, m KMI-30 now, s Shariah-compliant now */
  f: string;
  /** calendar index of the first close */
  at: number;
  /** closes in paisa: first value, then the change from the day before */
  c: number[];
  /** average traded value a day, Rs thousand, one per calendar month from the data's first month */
  tv: number[];
  /** cash dividends: [calendar index of the ex-date, Rs per share in paisa] */
  dv: [number, number][];
  /** annual earnings per share: [calendar index the result was known, EPS in paisa] */
  ep: [number, number][];
}

export interface LabFile {
  v: 1;
  kind: 'lab';
  built: string;
  /** trading days, YYYY-MM-DD: first day, then days since the one before */
  d0: string;
  dd: number[];
  /** KSE-100 and KMI-30 closes on each trading day, whole points, delta-encoded */
  ix: { KSE100: number[]; KMI30: number[] };
  /** month index (0 = the first trading day's month) of tv[0] */
  stocks: LabFileStock[];
  /** where dividends are complete from (YYYY-MM-DD); before it some may be missing */
  divFrom: string;
}

export interface LabStock {
  symbol: string;
  sector: string;
  kse100: boolean;
  kmi30: boolean;
  shariah: boolean;
  /** close on every calendar day, NaN before listing; carried forward on days without a trade */
  close: Float64Array;
  /** average traded value a day by calendar month, Rs */
  value: Float64Array;
  /** ex-date index → Rs per share */
  divs: { i: number; dps: number }[];
  eps: { i: number; eps: number }[];
}

export interface Lab {
  built: string;
  days: string[];
  /** month number of each day, counting from the first month */
  month: Int32Array;
  index: { KSE100: Float64Array; KMI30: Float64Array };
  stocks: LabStock[];
  divFrom: string;
}

const undelta = (a: number[]): number[] => {
  const out = new Array<number>(a.length);
  let x = 0;
  for (let i = 0; i < a.length; i++) out[i] = x = i === 0 ? a[0] : x + a[i];
  return out;
};
export const delta = (a: number[]): number[] => a.map((v, i) => (i === 0 ? v : v - a[i - 1]));

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export const isLabFile = (x: unknown): x is LabFile => {
  const f = x as LabFile | null;
  return !!f && f.v === 1 && f.kind === 'lab' && Array.isArray(f.stocks) && Array.isArray(f.dd) && typeof f.d0 === 'string';
};

export function decodeLab(f: LabFile): Lab {
  const days: string[] = [];
  let d = f.d0;
  f.dd.forEach((n, i) => {
    if (i > 0) d = addDays(d, n);
    days.push(d);
  });
  const n = days.length;
  const ym0 = Number(days[0].slice(0, 4)) * 12 + Number(days[0].slice(5, 7)) - 1;
  const month = new Int32Array(n);
  days.forEach((x, i) => (month[i] = Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7)) - 1 - ym0));
  const ix = (a: number[]) => {
    const v = undelta(a);
    const out = new Float64Array(n).fill(NaN);
    v.forEach((x, i) => (out[i] = x));
    return out;
  };
  const stocks = f.stocks.map((s) => {
    const close = new Float64Array(n).fill(NaN);
    undelta(s.c).forEach((p, k) => {
      if (s.at + k < n) close[s.at + k] = p / 100;
    });
    const months = month[n - 1] + 1;
    const value = new Float64Array(months).fill(0);
    s.tv.forEach((v, k) => k < months && (value[k] = v * 1000));
    return {
      symbol: s.s,
      sector: s.sec,
      kse100: s.f.includes('k'),
      kmi30: s.f.includes('m'),
      shariah: s.f.includes('s'),
      close,
      value,
      divs: s.dv.map(([i, p]) => ({ i, dps: p / 100 })),
      eps: s.ep.map(([i, p]) => ({ i, eps: p / 100 })),
    };
  });
  return { built: f.built, days, month, index: { KSE100: ix(f.ix.KSE100), KMI30: ix(f.ix.KMI30) }, stocks, divFrom: f.divFrom };
}
