/**
 * The backtesting lab's engine: replays a strategy over the lab's history.
 *
 * Rules are checked with the previous day's close and trades happen at the
 * next close, so nothing the strategy uses is from the future. Costs are taken
 * on every buy and sale, tax on dividends when they're paid and on gains at the
 * end of each tax year (July to June, losses set off against gains). Pure: no
 * React Native, so it runs in tests and in the daily job too.
 */
import type { Lab, LabStock } from './data';

export type Metric = 'yield' | 'pe' | 'mom12' | 'mom6' | 'mom3' | 'vol' | 'trend200' | 'off52h' | 'value' | 'price';
export type Op = '>' | '<';
export interface Filter {
  m: Metric;
  op: Op;
  v: number;
}
export type Universe = 'all' | 'kse100' | 'kmi30' | 'shariah';

export interface Strategy {
  id: string;
  name: string;
  universe: Universe;
  /** Rs million traded a day, at least */
  minValue: number;
  filters: Filter[];
  rank: Metric;
  /** highest first (true) or lowest first */
  desc: boolean;
  hold: number;
  /** months between rebalances */
  every: 1 | 3 | 6 | 12;
  weight: 'equal' | 'lowvol';
  /** most holdings from one sector (0: no limit) */
  perSector: number;
  /** sell when the price falls this far from its best close since buying (0.2 = 20%; 0: off) */
  stop: number;
  /** sell when the close drops under the 200-day average */
  exit200: boolean;
  /** year the test starts */
  from: number;
  lump: number;
  monthly: number;
  costs: boolean;
  tax: 'filer' | 'nonfiler' | 'none';
  bench: 'KSE100' | 'KMI30';
  /** stop at the start of this year (for checking each half of the period) */
  until?: number;
}

export const METRICS: Record<Metric, { label: string; unit: string; hint: string }> = {
  yield: { label: 'Dividend yield', unit: '%', hint: 'Cash dividends of the last 12 months against the price' },
  pe: { label: 'P/E', unit: '×', hint: 'Price against the last full year’s earnings per share (only once the year’s results were out)' },
  mom12: { label: '12-month change', unit: '%', hint: 'How far the price moved over the last year' },
  mom6: { label: '6-month change', unit: '%', hint: 'How far the price moved over the last six months' },
  mom3: { label: '3-month change', unit: '%', hint: 'How far the price moved over the last three months' },
  vol: { label: 'Volatility', unit: '%', hint: 'How much the price swings, a year (higher is bumpier)' },
  trend200: { label: 'Above 200-day average', unit: '%', hint: 'How far the price is above (or below, negative) its 200-day average' },
  off52h: { label: 'From 52-week high', unit: '%', hint: 'How far under its best price of the last year (0 is at the high)' },
  value: { label: 'Traded a day', unit: 'Rs M', hint: 'Average rupees traded a day last month' },
  price: { label: 'Share price', unit: 'Rs', hint: 'The share price' },
};

export const COST_RATE = 0.002; // commission, CDC, SECP and spread, each way
const DIV_TAX = { filer: 0.15, nonfiler: 0.3, none: 0 };
const CGT = { filer: 0.15, nonfiler: 0.3, none: 0 };
const Y = 252;

export interface Trade {
  i: number;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  /** why it was sold */
  why?: 'rebalance' | 'stop' | 'trend' | 'end';
  /** for sales: gain against the average cost, as a fraction */
  gain?: number;
  /** for sales: days held */
  held?: number;
}

export interface Holding {
  symbol: string;
  shares: number;
  cost: number;
  value: number;
  since: number;
}

export interface YearRow {
  year: number;
  ret: number;
  bench: number;
}

export interface Result {
  /** index of the first day */
  start: number;
  /** value, money put in, benchmark value with the same money, on each day from start */
  value: Float64Array;
  invested: Float64Array;
  bench: Float64Array;
  /** time-weighted growth of Rs 1 (contributions don't count as returns) */
  growth: Float64Array;
  benchGrowth: Float64Array;
  trades: Trade[];
  holdings: Holding[];
  cash: number;
  years: YearRow[];
  stats: {
    final: number;
    put: number;
    cagr: number;
    benchCagr: number;
    /** money-weighted return a year (counts when you put money in) */
    irr: number | null;
    maxDrop: number;
    dropFrom: number;
    dropTo: number;
    benchMaxDrop: number;
    vol: number;
    /** share of months it did better than the benchmark */
    monthsAhead: number;
    winRate: number | null;
    avgHeld: number | null;
    dividends: number;
    costs: number;
    tax: number;
    /** average share of the portfolio in shares (not cash) */
    invested: number;
    rebalances: number;
  };
  /** what the strategy chose at its last rebalance, best first */
  lastPicks: string[];
  warnings: string[];
}

// ---------------------------------------------------------------- indicators

interface Prep {
  s: LabStock;
  sum: Float64Array;
  r1: Float64Array;
  r2: Float64Array;
  first: number;
  /** cumulative cash dividends to each day (for trailing yield) */
  divCum: Float64Array;
  divAt: Map<number, number>;
}

function prepare(s: LabStock): Prep {
  const n = s.close.length;
  const sum = new Float64Array(n + 1);
  const r1 = new Float64Array(n + 1);
  const r2 = new Float64Array(n + 1);
  const divCum = new Float64Array(n + 1);
  const divAt = new Map<number, number>();
  for (const d of s.divs) divAt.set(d.i, (divAt.get(d.i) ?? 0) + d.dps);
  let first = -1;
  for (let i = 0; i < n; i++) {
    const c = s.close[i];
    if (first < 0 && c > 0) first = i;
    sum[i + 1] = sum[i] + (c > 0 ? c : 0);
    const r = i > 0 && c > 0 && s.close[i - 1] > 0 ? Math.log(c / s.close[i - 1]) : 0;
    r1[i + 1] = r1[i] + r;
    r2[i + 1] = r2[i] + r * r;
    divCum[i + 1] = divCum[i] + (divAt.get(i) ?? 0);
  }
  return { s, sum, r1, r2, first: first < 0 ? n : first, divCum, divAt };
}

const has = (p: Prep, i: number, back: number) => p.first <= i - back && p.s.close[i] > 0;

/** The metric for stock `p` on day `i` (using closes up to and including i). NaN when it can't be known. */
export function metricAt(p: Prep, m: Metric, i: number, month: Int32Array): number {
  const c = p.s.close[i];
  if (!(c > 0)) return NaN;
  switch (m) {
    case 'price':
      return c;
    case 'value': {
      const k = month[i] - 1;
      return k >= 0 ? p.s.value[k] / 1e6 : NaN;
    }
    case 'mom12':
      return has(p, i, Y) ? (c / p.s.close[i - Y] - 1) * 100 : NaN;
    case 'mom6':
      return has(p, i, 126) ? (c / p.s.close[i - 126] - 1) * 100 : NaN;
    case 'mom3':
      return has(p, i, 63) ? (c / p.s.close[i - 63] - 1) * 100 : NaN;
    case 'trend200':
      return has(p, i, 200) ? (c / ((p.sum[i + 1] - p.sum[i - 199]) / 200) - 1) * 100 : NaN;
    case 'vol': {
      if (!has(p, i, 60)) return NaN;
      const a = p.r1[i + 1] - p.r1[i - 59];
      const b = p.r2[i + 1] - p.r2[i - 59];
      const v = b / 60 - (a / 60) ** 2;
      return Math.sqrt(Math.max(0, v) * Y) * 100;
    }
    case 'off52h': {
      if (!has(p, i, Y)) return NaN;
      let hi = 0;
      for (let k = i - Y + 1; k <= i; k++) if (p.s.close[k] > hi) hi = p.s.close[k];
      return (c / hi - 1) * 100;
    }
    case 'yield': {
      if (!has(p, i, Y)) return NaN;
      return ((p.divCum[i + 1] - p.divCum[i - Y + 1]) / c) * 100;
    }
    case 'pe': {
      let e: number | null = null;
      for (const x of p.s.eps) if (x.i <= i) e = x.eps;
      return e != null && e > 0 ? c / e : NaN;
    }
  }
}

const inUniverse = (s: LabStock, u: Universe) => (u === 'all' ? true : u === 'kse100' ? s.kse100 : u === 'kmi30' ? s.kmi30 : s.shariah);

/** Ranks the stocks that pass the filters on day `i`, best first. */
export function choose(lab: Lab, preps: Prep[], st: Strategy, i: number): { symbol: string; k: number; p: Prep }[] {
  const out: { symbol: string; key: number; k: number; p: Prep; sector: string; vol: number }[] = [];
  for (let k = 0; k < preps.length; k++) {
    const p = preps[k];
    const s = p.s;
    if (!inUniverse(s, st.universe)) continue;
    if (!(s.close[i] > 0) || p.first > i - 21) continue;
    const mi = lab.month[i] - 1;
    if (st.minValue > 0 && !(mi >= 0 && s.value[mi] >= st.minValue * 1e6)) continue;
    let ok = true;
    for (const f of st.filters) {
      const v = metricAt(p, f.m, i, lab.month);
      if (!(f.op === '>' ? v > f.v : v < f.v)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const key = metricAt(p, st.rank, i, lab.month);
    if (!Number.isFinite(key)) continue;
    out.push({ symbol: s.symbol, key, k, p, sector: s.sector, vol: st.weight === 'lowvol' ? metricAt(p, 'vol', i, lab.month) : 0 });
  }
  out.sort((a, b) => (st.desc ? b.key - a.key : a.key - b.key) || (a.symbol < b.symbol ? -1 : 1));
  const per = new Map<string, number>();
  const picked: typeof out = [];
  for (const x of out) {
    if (picked.length >= st.hold) break;
    if (st.perSector > 0 && (per.get(x.sector) ?? 0) >= st.perSector) continue;
    per.set(x.sector, (per.get(x.sector) ?? 0) + 1);
    picked.push(x);
  }
  return picked;
}

// ---------------------------------------------------------------- simulation

interface Pos {
  k: number;
  shares: number;
  /** total cost including buying costs */
  cost: number;
  since: number;
  peak: number;
}

/** Internal rate of return a year for monthly cash flows (negative = money in), last one positive. */
export function irr(flows: number[], perYear = 12): number | null {
  if (flows.length < 2 || !flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;
  const npv = (r: number) => flows.reduce((a, f, t) => a + f / Math.pow(1 + r, t), 0);
  let lo = -0.99,
    hi = 1;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let it = 0; it < 100; it++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, perYear) - 1;
}

export function firstDayOf(lab: Lab, year: number): number {
  const k = lab.days.findIndex((d) => Number(d.slice(0, 4)) >= year);
  return k < 0 ? lab.days.length - 1 : k;
}

/** The earliest year a strategy can start: a year of history first, for the 12-month figures. */
export const earliestYear = (lab: Lab) => Number(lab.days[Math.min(lab.days.length - 1, Y + 5)].slice(0, 4)) + 1;

/**
 * The index's own dividends, which its points leave out: on each day, the average
 * dividend yield paid that day by the index's (current) members. An estimate, so
 * the comparison is like for like with strategies that collect dividends.
 */
const benchDivCache = new WeakMap<Lab, Record<'KSE100' | 'KMI30', Float64Array>>();
export function benchDividends(lab: Lab): Record<'KSE100' | 'KMI30', Float64Array> {
  let c = benchDivCache.get(lab);
  if (c) return c;
  const n = lab.days.length;
  const make = (inIt: (s: LabStock) => boolean) => {
    const out = new Float64Array(n);
    const members = lab.stocks.filter(inIt);
    const live = new Float64Array(n);
    for (const s of members) for (let i = 0; i < n; i++) if (s.close[i] > 0) live[i]++;
    for (const s of members)
      for (const d of s.divs) {
        const prev = d.i > 0 ? s.close[d.i - 1] : NaN;
        if (prev > 0 && live[d.i] > 0) out[d.i] += d.dps / prev / live[d.i];
      }
    return out;
  };
  c = { KSE100: make((s) => s.kse100), KMI30: make((s) => s.kmi30) };
  benchDivCache.set(lab, c);
  return c;
}

const prepCache = new WeakMap<Lab, Prep[]>();
const prepsOf = (lab: Lab) => {
  let p = prepCache.get(lab);
  if (!p) prepCache.set(lab, (p = lab.stocks.map(prepare)));
  return p;
};

export function runBacktest(lab: Lab, st: Strategy): Result {
  const preps = prepsOf(lab);
  const n = st.until ? Math.max(2, firstDayOf(lab, st.until)) : lab.days.length;
  const start = Math.max(firstDayOf(lab, Math.max(st.from, earliestYear(lab))), 1);
  const len = n - start;
  const value = new Float64Array(len);
  const invested = new Float64Array(len);
  const bench = new Float64Array(len);
  const growth = new Float64Array(len);
  const benchGrowth = new Float64Array(len);
  const idx = lab.index[st.bench];
  const benchDiv = benchDividends(lab)[st.bench];
  const costRate = st.costs ? COST_RATE : 0;
  const divTax = DIV_TAX[st.tax];
  const cgt = CGT[st.tax];

  let cash = 0;
  let put = 0;
  let units = 0; // benchmark units
  const pos = new Map<number, Pos>();
  const trades: Trade[] = [];
  let dividends = 0,
    costs = 0,
    taxPaid = 0,
    rebalances = 0;
  let gainsThisYear = 0;
  let lastPicks: string[] = [];
  const monthlyFlows: number[] = [];
  let pendingSell = new Map<number, Trade['why']>();
  let g = 1,
    bg = 1;
  let investedShare = 0;
  const closeOf = (k: number, i: number) => preps[k].s.close[i];

  const sell = (k: number, i: number, why: Trade['why'], shares?: number) => {
    const p = pos.get(k);
    if (!p) return;
    const px = closeOf(k, i);
    if (!(px > 0)) return;
    const q = Math.min(p.shares, shares ?? p.shares);
    const gross = q * px;
    const fee = gross * costRate;
    const costPart = (p.cost * q) / p.shares;
    const gain = gross - fee - costPart;
    gainsThisYear += gain;
    cash += gross - fee;
    costs += fee;
    trades.push({ i, symbol: preps[k].s.symbol, side: 'sell', shares: q, price: px, why, gain: costPart > 0 ? (gross - fee) / costPart - 1 : 0, held: i - p.since });
    if (q >= p.shares - 1e-9) pos.delete(k);
    else pos.set(k, { ...p, shares: p.shares - q, cost: p.cost - costPart });
  };
  const buy = (k: number, i: number, rupees: number) => {
    const px = closeOf(k, i);
    if (!(px > 0) || rupees <= 0) return;
    const q = Math.floor(rupees / (px * (1 + costRate)));
    if (q < 1) return;
    const gross = q * px;
    const fee = gross * costRate;
    cash -= gross + fee;
    costs += fee;
    const p = pos.get(k);
    if (p) pos.set(k, { ...p, shares: p.shares + q, cost: p.cost + gross + fee });
    else pos.set(k, { k, shares: q, cost: gross + fee, since: i, peak: px });
    trades.push({ i, symbol: preps[k].s.symbol, side: 'buy', shares: q, price: px });
  };
  const worth = (i: number) => {
    let v = cash;
    for (const p of pos.values()) {
      const c = closeOf(p.k, i);
      v += p.shares * (c > 0 ? c : 0);
    }
    return v;
  };

  const startMonth = lab.month[start];
  for (let i = start; i < n; i++) {
    const t = i - start;
    const before = t > 0 ? value[t - 1] : 0;
    const benchBefore = units * (idx[i - 1] > 0 ? idx[i - 1] : 0);
    let flow = 0;
    const newMonth = i === start || lab.month[i] !== lab.month[i - 1];
    // money in: the lump sum on day one, then each month
    if (i === start) flow += st.lump;
    if (newMonth && i !== start) flow += st.monthly;
    if (i === start && st.monthly > 0 && st.lump === 0) flow += st.monthly;
    if (flow > 0) {
      cash += flow;
      put += flow;
      const mk = lab.month[i] - lab.month[start];
      while (monthlyFlows.length <= mk) monthlyFlows.push(0);
      monthlyFlows[mk] -= flow;
      if (idx[i] > 0) units += flow / idx[i];
    }
    // dividends paid to holders on the ex-date
    for (const p of pos.values()) {
      const d = preps[p.k].divAt.get(i);
      if (d) {
        const net = p.shares * d * (1 - divTax);
        cash += net;
        dividends += net;
        taxPaid += p.shares * d * divTax;
      }
    }
    // sales decided yesterday (stop or trend)
    for (const [k, why] of pendingSell) sell(k, i, why);
    pendingSell = new Map();
    // rebalance on the first day of the month, every few months, from yesterday's closes
    const monthsIn = lab.month[i] - startMonth;
    if (newMonth && monthsIn % st.every === 0) {
      rebalances++;
      const picks = choose(lab, preps, st, i - 1);
      lastPicks = picks.map((x) => x.symbol);
      const want = new Set(picks.map((x) => x.k));
      for (const k of [...pos.keys()]) if (!want.has(k)) sell(k, i, 'rebalance');
      const total = worth(i);
      let w = picks.map(() => 1);
      if (st.weight === 'lowvol') w = picks.map((x) => 1 / Math.max(5, metricAt(x.p, 'vol', i - 1, lab.month) || 30));
      const ws = w.reduce((a, b) => a + b, 0) || 1;
      // trim the ones over their share first, then top up
      const targets = picks.map((x, j) => ({ k: x.k, target: (total * w[j]) / ws }));
      for (const x of targets) {
        const p = pos.get(x.k);
        const px = closeOf(x.k, i);
        if (!p || !(px > 0)) continue;
        const now = p.shares * px;
        if (now > x.target * 1.25) sell(x.k, i, 'rebalance', Math.floor((now - x.target) / px));
      }
      for (const x of targets) {
        const p = pos.get(x.k);
        const px = closeOf(x.k, i);
        const now = p ? p.shares * px : 0;
        if (now < x.target * (p ? 0.8 : 1)) buy(x.k, i, Math.min(cash, x.target - now));
      }
    } else if (flow > 0 && pos.size) {
      // new money between rebalances goes to the current holdings, evenly
      const share = cash / pos.size;
      for (const k of [...pos.keys()]) buy(k, i, Math.min(cash, share));
    }
    // tax on the year's gains at the end of June
    const mm = lab.days[i].slice(5, 7);
    if (i + 1 < n && mm === '06' && lab.days[i + 1].slice(5, 7) === '07') {
      if (gainsThisYear > 0 && cgt > 0) {
        const tx = gainsThisYear * cgt;
        cash -= tx;
        taxPaid += tx;
      }
      gainsThisYear = 0;
    }
    // stops and trend exits for tomorrow, from today's close
    for (const p of pos.values()) {
      const c = closeOf(p.k, i);
      if (!(c > 0)) continue;
      if (c > p.peak) p.peak = c;
      if (st.stop > 0 && c <= p.peak * (1 - st.stop)) pendingSell.set(p.k, 'stop');
      else if (st.exit200 && metricAt(preps[p.k], 'trend200', i, lab.month) < 0) pendingSell.set(p.k, 'trend');
    }
    const v = worth(i);
    value[t] = v;
    invested[t] = put;
    // the index's dividends, after the same tax, bought back into it
    if (benchDiv[i] > 0) units *= 1 + benchDiv[i] * (1 - divTax);
    bench[t] = units * (idx[i] > 0 ? idx[i] : idx[i - 1]);
    if (t > 0 && before > 0) g *= (v - flow) / before;
    if (t > 0 && benchBefore > 0) bg *= (bench[t] - flow) / benchBefore;
    growth[t] = g;
    benchGrowth[t] = bg;
    if (v > 0) investedShare += 1 - Math.max(0, cash) / v;
  }
  while (monthlyFlows.length <= lab.month[n - 1] - lab.month[start]) monthlyFlows.push(0);
  monthlyFlows[monthlyFlows.length - 1] += value[len - 1];

  // ---------------------------------------------------------------- stats
  const yearsN = len / Y;
  const cagr = len > 1 ? Math.pow(growth[len - 1], 1 / yearsN) - 1 : 0;
  const benchCagr = len > 1 ? Math.pow(benchGrowth[len - 1], 1 / yearsN) - 1 : 0;
  const ddOf = (a: Float64Array) => {
    let peak = a[0],
      pk = 0,
      worst = 0,
      from = 0,
      to = 0;
    for (let t = 0; t < a.length; t++) {
      if (a[t] > peak) {
        peak = a[t];
        pk = t;
      }
      const d = a[t] / peak - 1;
      if (d < worst) {
        worst = d;
        from = pk;
        to = t;
      }
    }
    return { worst, from, to };
  };
  const dd = ddOf(growth);
  let s1 = 0,
    s2 = 0;
  for (let t = 1; t < len; t++) {
    const r = Math.log(growth[t] / growth[t - 1]);
    s1 += r;
    s2 += r * r;
  }
  const m = Math.max(1, len - 1);
  const vol = Math.sqrt(Math.max(0, s2 / m - (s1 / m) ** 2) * Y);
  // calendar years and months against the benchmark
  const years: YearRow[] = [];
  let ahead = 0,
    months = 0;
  let y0 = 0,
    m0 = 0;
  for (let t = 1; t <= len; t++) {
    const i = start + t;
    const endYear = t === len || lab.days[i].slice(0, 4) !== lab.days[i - 1].slice(0, 4);
    const endMonth = t === len || lab.month[i] !== lab.month[i - 1];
    if (endMonth) {
      months++;
      if (growth[t - 1] / growth[m0] > benchGrowth[t - 1] / benchGrowth[m0]) ahead++;
      m0 = t - 1;
    }
    if (endYear) {
      years.push({ year: Number(lab.days[start + t - 1].slice(0, 4)), ret: growth[t - 1] / growth[y0] - 1, bench: benchGrowth[t - 1] / benchGrowth[y0] - 1 });
      y0 = t - 1;
    }
  }
  const sales = trades.filter((x) => x.side === 'sell');
  const holdings: Holding[] = [...pos.values()]
    .map((p) => ({ symbol: preps[p.k].s.symbol, shares: p.shares, cost: p.cost, value: p.shares * (closeOf(p.k, n - 1) || 0), since: p.since }))
    .sort((a, b) => b.value - a.value);
  const warnings: string[] = [];
  if (st.filters.some((f) => f.m === 'yield') || st.rank === 'yield') {
    if (lab.days[start] < lab.divFrom) warnings.push(`Dividend history is complete from ${lab.divFrom.slice(0, 4)}; before that some dividends may be missing, so dividend rules pick from fewer stocks.`);
  }
  if (st.filters.some((f) => f.m === 'pe') || st.rank === 'pe') warnings.push('P/E needs each year’s earnings, which Sahm has for the last few years only; earlier, no stock passes a P/E rule.');
  if (rebalances > 0 && trades.length === 0) warnings.push('No stock ever passed these rules, so the money stayed in cash.');
  return {
    start,
    value,
    invested,
    bench,
    growth,
    benchGrowth,
    trades,
    holdings,
    cash,
    years,
    stats: {
      final: value[len - 1],
      put,
      cagr,
      benchCagr,
      irr: irr(monthlyFlows),
      maxDrop: dd.worst,
      dropFrom: start + dd.from,
      dropTo: start + dd.to,
      benchMaxDrop: ddOf(benchGrowth).worst,
      vol,
      monthsAhead: months ? ahead / months : 0,
      winRate: sales.length ? sales.filter((x) => (x.gain ?? 0) > 0).length / sales.length : null,
      avgHeld: sales.length ? sales.reduce((a, x) => a + (x.held ?? 0), 0) / sales.length : null,
      dividends,
      costs,
      tax: taxPaid,
      invested: len ? investedShare / len : 0,
      rebalances,
    },
    lastPicks,
    warnings,
  };
}
