/**
 * Backtest of Sahm's fair value (the P/E methods; the book-value methods need
 * past balance sheets, which aren't available).
 *   tsx scripts/fair-study.ts <history dir> <companies dir>
 *
 * On quarterly dates from 2023, every stock is valued with only what was known
 * then: the latest fiscal-year profit published by that date (fiscal year end
 * + 100 days), prices up to that date, and peers valued the same way. Then the
 * next 6 and 12 months' returns are compared across Undervalued / Fairly valued
 * / Overvalued. Survivorship caveat: only companies listed today are included.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Candle, FinTable } from '../src/psx/types';
import { BAND, fiscalEndMonth, median } from '../src/analysis/fairValue';

const [hist, comp] = process.argv.slice(2);
const DAY = 864e5;
const PUBLISH_LAG = 100 * DAY;

interface Co { sym: string; sector: string; shares: number; fyEnd: number; years: { y: number; end: number; known: number; eps: number }[]; c: Candle[] }
const cos: Co[] = [];
for (const f of readdirSync(comp).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const j = JSON.parse(readFileSync(join(comp, f), 'utf8')) as { symbol: string; sector: string | null; shares: number | null; fiscalYearEnd: string | null; annual: FinTable | null };
  const hp = join(hist, f);
  if (!j.annual || !j.shares || !j.sector || !existsSync(hp)) continue;
  const c = (JSON.parse(readFileSync(hp, 'utf8')) as number[][]).map(([t, o, h, l, cl, v]) => ({ t, o, h, l, c: cl, v })).filter((b) => b.c > 0);
  const m = fiscalEndMonth(j.fiscalYearEnd);
  const profit = j.annual.rows.find((r) => /profit after/i.test(r.label))?.values ?? [];
  const years = j.annual.periods
    .map((p, i) => {
      const y = Number(p.match(/\d{4}/)?.[0]);
      const end = Date.UTC(y, m + 1, 1);
      return { y, end, known: end + PUBLISH_LAG, eps: profit[i] != null ? (profit[i] as number) * 1000 / j.shares! : NaN };
    })
    .filter((x) => x.y && Number.isFinite(x.eps))
    .sort((a, b) => a.end - b.end);
  if (years.length) cos.push({ sym: j.symbol, sector: j.sector.toUpperCase(), shares: j.shares, fyEnd: m, years, c });
}
console.log(`${cos.length} companies with results and prices`);

const idxAt = (c: Candle[], t: number) => {
  let lo = 0, hi = c.length - 1, r = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (c[mid].t <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  return r;
};

interface Obs { sym: string; date: number; gap: number; gapPeer: number | null; gapOwn: number | null; r6: number | null; r12: number | null; liquid: boolean }
const obs: Obs[] = [];
const dates: number[] = [];
for (let y = 2023; y <= 2026; y++) for (const mo of [0, 3, 6, 9]) { const t = Date.UTC(y, mo, 15); if (t >= Date.UTC(2023, 3, 15) && t <= Date.UTC(2026, 3, 15)) dates.push(t); }

for (const D of dates) {
  // Each company's state on date D.
  const state = cos.map((co) => {
    const i = idxAt(co.c, D);
    if (i < 60 || D - co.c[i].t > 10 * DAY) return null; // no recent trading
    const known = co.years.filter((x) => x.known <= D);
    const last = known[known.length - 1];
    if (!last) return null;
    const price = co.c[i].c;
    const pe = last.eps > 0 ? price / last.eps : null;
    // Own past P/E: average price in each known fiscal year ÷ that year's EPS.
    const own = known
      .map((x) => {
        const a = idxAt(co.c, x.end - 365 * DAY), b = idxAt(co.c, x.end - DAY);
        if (a < 0 || b - a < 120 || x.eps <= 0) return null;
        let s = 0; for (let k = a + 1; k <= b; k++) s += co.c[k].c;
        const v = s / (b - a) / x.eps;
        return v > 0 && v <= 60 ? v : null;
      })
      .filter((v): v is number => v != null);
    const vals = co.c.slice(Math.max(0, i - 59), i + 1).map((b) => b.v * b.c).sort((p, q) => p - q);
    const fwd = (n: number) => (i + n < co.c.length ? co.c[i + n].c / price - 1 : null);
    return { co, price, eps: last.eps, pe, own, liquid: vals[vals.length >> 1] >= 5e6, r6: fwd(126), r12: fwd(250) };
  });
  const bySector = new Map<string, number[]>();
  for (const s of state) if (s?.pe && s.pe <= 60) (bySector.get(s.co.sector) ?? bySector.set(s.co.sector, []).get(s.co.sector)!).push(s.pe);
  for (const s of state) {
    if (!s || !s.pe) continue; // P/E methods need a profit
    const peers = (bySector.get(s.co.sector) ?? []).filter((v) => v !== s.pe);
    const sectorPE = peers.length >= 3 ? median(peers) : null;
    const ownPE = s.own.length >= 2 ? median(s.own) : null;
    const methods = [sectorPE ? s.eps * sectorPE : null, ownPE ? s.eps * ownPE : null].filter((v): v is number => v != null);
    if (!methods.length) continue;
    const mid = median(methods)!;
    obs.push({ sym: s.co.sym, date: D, gap: mid / s.price - 1, gapPeer: sectorPE ? sectorPE / s.pe - 1 : null, gapOwn: ownPE ? ownPE / s.pe - 1 : null, r6: s.r6, r12: s.r12, liquid: s.liquid });
  }
}
console.log(`${obs.length} valuations on ${dates.length} dates (${obs.filter((o) => o.liquid).length} liquid)`);

const label = (gap: number) => (1 / (1 + gap) < 1 - BAND ? 'Undervalued' : 1 / (1 + gap) > 1 + BAND ? 'Overvalued' : 'Fairly valued');
const pc = (x: number | null) => (x == null ? '   -   ' : ((x * 100).toFixed(1) + '%').padStart(7));
function row(name: string, os: Obs[], k: 'r6' | 'r12') {
  const r = os.map((o) => o[k]).filter((v): v is number => v != null);
  if (!r.length) return console.log(name.padEnd(28), '   0');
  const avg = r.reduce((a, b) => a + b, 0) / r.length;
  console.log(name.padEnd(28), String(r.length).padStart(5), 'avg', pc(avg), 'median', pc(median(r)), 'rose', pc(r.filter((v) => v > 0).length / r.length));
}
function table(title: string, os: Obs[], gapOf: (o: Obs) => number | null) {
  for (const k of ['r6', 'r12'] as const) {
    console.log(`\n== ${title}, next ${k === 'r6' ? '6' : '12'} months`);
    const g = os.filter((o) => gapOf(o) != null);
    row('all', g, k);
    for (const l of ['Undervalued', 'Fairly valued', 'Overvalued']) row(l, g.filter((o) => label(gapOf(o)!) === l), k);
    const s = [...g].sort((a, b) => gapOf(a)! - gapOf(b)!);
    for (let q = 0; q < 5; q++) row(`  quintile ${q + 1} (${q === 0 ? 'most over' : q === 4 ? 'most under' : ''}valued)`.replace('(valued)', ''), s.slice(Math.floor((q * s.length) / 5), Math.floor(((q + 1) * s.length) / 5)), k);
  }
}
const liquid = obs.filter((o) => o.liquid);
table('Fair value midpoint, liquid', liquid, (o) => o.gap);
table('Fair value midpoint, all', obs, (o) => o.gap);
table('Sector P/E alone, liquid', liquid, (o) => o.gapPeer);
table('Own past P/E alone, liquid', liquid, (o) => o.gapOwn);

console.log('\n== By date, liquid, 12 months: Undervalued avg − Overvalued avg (and 6 months)');
for (const D of dates) {
  const os = liquid.filter((o) => o.date === D);
  const avg = (xs: Obs[], k: 'r6' | 'r12') => { const r = xs.map((o) => o[k]).filter((v): v is number => v != null); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; };
  const u = os.filter((o) => label(o.gap) === 'Undervalued'), v = os.filter((o) => label(o.gap) === 'Overvalued');
  const d12 = avg(u, 'r12') != null && avg(v, 'r12') != null ? avg(u, 'r12')! - avg(v, 'r12')! : null;
  const d6 = avg(u, 'r6') != null && avg(v, 'r6') != null ? avg(u, 'r6')! - avg(v, 'r6')! : null;
  console.log(new Date(D).toISOString().slice(0, 10), `n=${os.length} under=${u.length} over=${v.length}`, '12m', pc(d12), ' 6m', pc(d6));
}
