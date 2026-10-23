/**
 * Backtest for a long-term buy list (held 6–12 months), to replace the
 * short-term daily picks.
 *   tsx scripts/longterm-study.ts <history dir> [companies dir]
 *
 * Every month (21 sessions) from 2017, liquid stocks (median traded value
 * ≥ Rs 5M a day over 60 sessions) are ranked by each candidate rule using only
 * prices known that day; the top N form the list. Its average return over the
 * next 6 and 12 months is compared with the average liquid stock (equal
 * weight, same prices, so dividends are left out of both). 2017–21 is used to
 * choose, 2022 onwards to check. With a companies dir, fundamental filters
 * (profit, growth, P/E vs sector) are tested from 2024, when results exist.
 * Survivorship caveat: only stocks listed today are in the data.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { longTermList } from '../src/analysis/longterm';

const [hist, comp] = process.argv.slice(2);
const TOP = Number(process.env.TOP ?? 10);
const DAY = 864e5;

interface S { sym: string; t: number[]; c: number[]; val: number[] }
const stocks: S[] = [];
for (const f of readdirSync(hist).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const rows = (JSON.parse(readFileSync(join(hist, f), 'utf8')) as number[][]).filter((r) => r[4] > 0);
  if (rows.length < 300) continue;
  stocks.push({ sym: f.replace('.json', ''), t: rows.map((r) => r[0]), c: rows.map((r) => r[4]), val: rows.map((r) => r[4] * r[5]) });
}
// Calendar: the trading days of the stock with the longest history.
const cal = stocks.reduce((a, s) => (s.t.length > a.length ? s.t : a), [] as number[]);
const at = (s: S, t: number) => {
  let lo = 0, hi = s.t.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.t[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
};

// ------------------------------------------------------------ fundamentals
interface Year { end: number; known: number; eps: number; sales: number }
const fund = new Map<string, { sector: string; years: Year[] }>();
const raw = new Map<string, { sector: string; annual: { periods: string[]; rows: { label: string; values: (number | null)[] }[] }; mon: number }>();
if (comp && existsSync(comp)) {
  for (const f of readdirSync(comp).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    const j = JSON.parse(readFileSync(join(comp, f), 'utf8'));
    if (!j.annual?.periods?.length || !j.sector) continue;
    const mon = (() => { const m = String(j.fiscalYearEnd ?? 'June').slice(0, 3).toLowerCase(); const i = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m); return i < 0 ? 5 : i; })();
    const row = (re: RegExp) => j.annual.rows.find((r: { label: string }) => re.test(r.label))?.values ?? [];
    const eps = row(/^eps/i), sales = row(/sales/i);
    const years: Year[] = j.annual.periods
      .map((p: string, i: number) => { const y = Number(p.match(/\d{4}/)?.[0]); const end = Date.UTC(y, mon + 1, 1); return { end, known: end + Number(process.env.LAG ?? 100) * DAY, eps: eps[i], sales: sales[i] }; })
      .filter((x: Year) => Number.isFinite(x.eps))
      .sort((a: Year, b: Year) => a.end - b.end);
    fund.set(j.symbol, { sector: String(j.sector).toUpperCase(), years });
    raw.set(j.symbol, { sector: j.sector, annual: j.annual, mon });
  }
}

// ------------------------------------------------------------ signals
type Snap = { s: S; i: number; price: number; mom12: number; mom6: number; above200: boolean; vol: number; nearHigh: number; ma200slope: number };
function snap(s: S, t: number): Snap | null {
  const i = at(s, t);
  if (i < 260 || t - s.t[i] > 7 * DAY) return null;
  const v = s.val.slice(i - 59, i + 1).sort((a, b) => a - b)[30];
  if (v < 5e6) return null;
  const price = s.c[i];
  let sum = 0; for (let k = i - 199; k <= i; k++) sum += s.c[k];
  let sumOld = 0; for (let k = i - 219; k <= i - 20; k++) sumOld += s.c[k];
  const r: number[] = []; for (let k = i - 119; k <= i; k++) r.push(Math.log(s.c[k] / s.c[k - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  const hi = Math.max(...s.c.slice(i - 251, i + 1));
  return { s, i, price, mom12: s.c[i - 21] / s.c[i - 250] - 1, mom6: s.c[i - 21] / s.c[i - 126] - 1, above200: price > sum / 200, vol, nearHigh: price / hi, ma200slope: sum / sumOld - 1 };
}
const fwd = (x: Snap, n: number) => { const j = x.i + n; return j < x.s.c.length ? Math.max(-0.95, Math.min(5, x.s.c[j] / x.price - 1)) : null; };

function epsInfo(sym: string, t: number) {
  const f = fund.get(sym); if (!f) return null;
  const known = f.years.filter((y) => y.known <= t);
  if (!known.length) return null;
  const last = known[known.length - 1], prev = known[known.length - 2];
  return { sector: f.sector, eps: last.eps, growth: prev && prev.eps > 0 ? last.eps / prev.eps - 1 : null };
}

type Rule = { name: string; fund?: boolean; pick: (u: Snap[], t: number) => Snap[] };
const top = (u: Snap[], key: (x: Snap) => number) => [...u].sort((a, b) => key(b) - key(a)).slice(0, TOP);
const pe = (x: Snap, t: number) => { const e = epsInfo(x.s.sym, t); return e && e.eps > 0 ? x.price / e.eps : null; };
const rules: Rule[] = [
  { name: 'random 10 (baseline check)', pick: (u) => { const a = [...u]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a.slice(0, TOP); } },
  { name: '12-month momentum', pick: (u) => top(u, (x) => x.mom12) },
  { name: '6-month momentum', pick: (u) => top(u, (x) => x.mom6) },
  { name: 'near 52-week high', pick: (u) => top(u, (x) => x.nearHigh) },
  { name: 'lowest volatility', pick: (u) => top(u, (x) => -x.vol) },
  { name: 'low vol, above 200d', pick: (u) => top(u.filter((x) => x.above200), (x) => -x.vol) },
  { name: 'momentum 12m, above 200d, rising 200d', pick: (u) => top(u.filter((x) => x.above200 && x.ma200slope > 0), (x) => x.mom12) },
  { name: 'momentum ÷ volatility', pick: (u) => top(u, (x) => x.mom12 / x.vol) },
  { name: 'worst 12-month (losers)', pick: (u) => top(u, (x) => -x.mom12) },
  { name: 'profitable, P/E < sector median', fund: true, pick: (u, t) => {
    const withPe = u.map((x) => ({ x, pe: pe(x, t), e: epsInfo(x.s.sym, t) })).filter((z) => z.pe != null && z.pe < 60 && z.e);
    const med = new Map<string, number>();
    for (const sec of new Set(withPe.map((z) => z.e!.sector))) { const v = withPe.filter((z) => z.e!.sector === sec).map((z) => z.pe!).sort((a, b) => a - b); med.set(sec, v[v.length >> 1]); }
    return withPe.filter((z) => z.pe! < med.get(z.e!.sector)!).sort((a, b) => a.pe! - b.pe!).slice(0, TOP).map((z) => z.x);
  } },
  { name: 'profit growing + momentum', fund: true, pick: (u, t) => top(u.filter((x) => { const e = epsInfo(x.s.sym, t); return e && e.eps > 0 && (e.growth ?? -1) > 0; }), (x) => x.mom12) },
  { name: 'profit growing, cheap vs sector, above 200d', fund: true, pick: (u, t) => {
    const ok = u.map((x) => ({ x, pe: pe(x, t), e: epsInfo(x.s.sym, t) })).filter((z) => z.pe != null && z.pe < 60 && z.e && (z.e.growth ?? -1) > 0 && z.x.above200);
    return ok.sort((a, b) => a.pe! - b.pe!).slice(0, TOP).map((z) => z.x);
  } },
  { name: 'Sahm long-term list (app code)', fund: true, pick: (u, t) => {
    const items = u.map((x) => {
      const r = raw.get(x.s.sym);
      if (!r) return null;
      const keep = r.annual.periods.map((p, i) => [p, i] as const).filter(([p]) => Date.UTC(Number(p.match(/\d{4}/)?.[0]), r.mon + 1, 1) + Number(process.env.LAG ?? 100) * DAY <= t);
      const annual = { periods: keep.map(([p]) => p), rows: r.annual.rows.map((row) => ({ label: row.label, values: keep.map(([, i]) => row.values[i]) })) };
      const candles = x.s.t.slice(0, x.i + 1).map((tt, k) => ({ t: tt, o: x.s.c[k], h: x.s.c[k], l: x.s.c[k], c: x.s.c[k], v: x.s.val[k] / x.s.c[k] }));
      return { symbol: x.s.sym, sector: r.sector, candles, annual };
    }).filter((z): z is NonNullable<typeof z> => !!z);
    const bySym = new Map(u.map((x) => [x.s.sym, x]));
    return longTermList(items).list.map((r) => bySym.get(r.symbol)!);
  } },
];

const res = new Map<string, Map<string, { r6: number[]; r12: number[]; ex6: number[]; ex12: number[] }>>();
const add = (rule: string, period: string, k: 'r6' | 'r12' | 'ex6' | 'ex12', v: number) => {
  const p = (res.get(rule) ?? res.set(rule, new Map()).get(rule)!);
  const o = p.get(period) ?? p.set(period, { r6: [], r12: [], ex6: [], ex12: [] }).get(period)!;
  o[k].push(v);
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

for (let d = 260; d < cal.length - 126; d += 21) {
  const t = cal[d];
  const y = new Date(t).getUTCFullYear();
  const period = y <= 2021 ? '2017–21' : '2022+';
  const u = stocks.map((s) => snap(s, t)).filter((x): x is Snap => !!x);
  if (u.length < 40) continue;
  const base6 = mean(u.map((x) => fwd(x, 126)).filter((v): v is number => v != null));
  const base12s = u.map((x) => fwd(x, 250)).filter((v): v is number => v != null);
  const base12 = base12s.length > u.length / 2 ? mean(base12s) : null;
  add('all liquid stocks', period, 'r6', base6);
  if (t >= Date.UTC(2023, 9, 1)) add('all liquid stocks', y <= 2024 ? '2023–24' : '2025+', 'r6', base6);
  if (base12 != null) add('all liquid stocks', period, 'r12', base12);
  for (const r of rules) {
    if (r.fund && t < Date.UTC(2023, 9, 1)) continue;
    const list = r.pick(u, t);
    if (list.length < 3) continue;
    const per = r.fund ? (y <= 2024 ? '2023–24' : '2025+') : period;
    const r6 = mean(list.map((x) => fwd(x, 126)).filter((v): v is number => v != null));
    add(r.name, per, 'r6', r6);
    add(r.name, per, 'ex6', r6 - base6);
    if (process.env.DETAIL && r.name.includes('app code')) console.log(`${new Date(t).toISOString().slice(0, 10)} n=${list.length} 6m ${(r6 * 100).toFixed(1)}% all ${(base6 * 100).toFixed(1)}% ${list.map((x) => x.s.sym).join(' ')}`);
    const l12 = list.map((x) => fwd(x, 250)).filter((v): v is number => v != null);
    if (base12 != null && l12.length >= list.length / 2) { add(r.name, per, 'r12', mean(l12)); add(r.name, per, 'ex12', mean(l12) - base12); }
  }
}

const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
console.log(`${stocks.length} stocks, top ${TOP}, monthly lists, returns are price-only averages\n`);
console.log('rule | period | lists | 6m avg | vs all | beat all (6m) | 12m avg | vs all');
for (const [name, per] of res) {
  for (const [period, o] of per) {
    const beat = o.ex6.length ? o.ex6.filter((v) => v > 0).length / o.ex6.length : null;
    console.log(`${name} | ${period} | ${o.r6.length} | ${pc(mean(o.r6))} | ${o.ex6.length ? pc(mean(o.ex6)) : '–'} | ${beat == null ? '–' : Math.round(beat * 100) + '%'} | ${o.r12.length ? pc(mean(o.r12)) : '–'} | ${o.ex12.length ? pc(mean(o.ex12)) : '–'}`);
  }
}
