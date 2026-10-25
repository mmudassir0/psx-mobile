/**
 * Does the expected range hold? For every day, the range from prices known
 * that day is compared with where the price actually was 1, 5 and 21 sessions
 * later. A good 80% range contains it about 80% of the time, in calm and
 * wild markets alike. Also finds the multiplier that would have given 80%.
 *   tsx scripts/range-study.ts <history dir> [kse100.json]
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ewmaVol } from '../src/analysis/range';

const [hist, kseFile] = process.argv.slice(2);
const H = [1, 5, 21];
const MIX = (process.env.MIX ?? '0,0,0').split(',').map(Number);
const blendWeight = (h: number) => MIX[H.indexOf(h)] ?? 0;
type Series = { name: string; t: number[]; c: number[]; liquid: boolean[] };
const series: Series[] = [];
for (const f of readdirSync(hist).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const rows = (JSON.parse(readFileSync(join(hist, f), 'utf8')) as number[][]).filter((r) => r[4] > 0);
  if (rows.length < 400) continue;
  const val = rows.map((r) => r[4] * r[5]);
  const liquid = val.map((_, i) => (i < 60 ? false : val.slice(i - 59, i + 1).sort((a, b) => a - b)[30] >= 5e6));
  series.push({ name: f.replace('.json', ''), t: rows.map((r) => r[0]), c: rows.map((r) => r[4]), liquid });
}
const index: Series | null =
  kseFile && existsSync(kseFile)
    ? (() => {
        const k = JSON.parse(readFileSync(kseFile, 'utf8')) as { t: number; v: number }[];
        return { name: 'KSE100', t: k.map((p) => p.t), c: k.map((p) => p.v), liquid: k.map(() => true) };
      })()
    : null;

/** standardized moves |log(P[t+h]/P[t])| / (vol_t * sqrt(h)) */
function zs(s: Series, h: number, from: number, to: number): { z: number; year: number; calm: boolean }[] {
  const out: { z: number; year: number; calm: boolean }[] = [];
  // incremental EWMA to avoid recomputing from scratch
  let v: number | null = null;
  const vols: number[] = [];
  for (let i = 1; i < s.c.length; i++) {
    const r = Math.log(s.c[i] / s.c[i - 1]);
    if (i <= 30) {
      vols.push(NaN);
      if (i === 30) {
        let a = 0;
        for (let k = 1; k <= 30; k++) a += Math.log(s.c[k] / s.c[k - 1]) ** 2;
        v = a / 30;
      }
      continue;
    }
    v = 0.94 * v! + 0.06 * r * r;
    // blend with the last year's plain volatility: more weight on it the further ahead
    const w = blendWeight(h);
    if (w > 0 && i > 250) {
      let a = 0;
      for (let k = i - 249; k <= i; k++) a += Math.log(s.c[k] / s.c[k - 1]) ** 2;
      vols.push(Math.sqrt((1 - w) * v + w * (a / 250)));
    } else vols.push(Math.sqrt(v));
  }
  const med = [...vols.filter((x) => Number.isFinite(x))].sort((a, b) => a - b)[Math.floor(vols.length / 2)] ?? 0;
  for (let i = 60; i + h < s.c.length; i++) {
    const vol = vols[i - 1];
    const year = new Date(s.t[i]).getUTCFullYear();
    if (!Number.isFinite(vol) || vol <= 0 || !s.liquid[i] || year < from || year > to) continue;
    out.push({ z: Math.abs(Math.log(s.c[i + h] / s.c[i])) / (vol * Math.sqrt(h)), year, calm: vol < med });
  }
  return out;
}
const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(p * (s.length - 1))];
};
const cover = (a: { z: number }[], z: number) => a.filter((x) => x.z <= z).length / a.length;

// sanity: the shared function matches the incremental one at the end of a series
const s0 = series[0];
console.log(`check ewmaVol on ${s0.name}: ${ewmaVol(s0.c)?.toFixed(5)}`);

for (const [label, from, to] of [['2017–21 (choose)', 2017, 2021], ['2022+ (check)', 2022, 2030]] as const) {
  console.log(`\n== liquid stocks, ${label}`);
  for (const h of H) {
    const all = series.flatMap((s) => zs(s, h, from, to));
    const z80 = q(all.map((x) => x.z), 0.8);
    console.log(
      `${h}d: ${all.length} cases · inside with 1.28: ${(cover(all, 1.28) * 100).toFixed(1)}% (calm days ${(cover(all.filter((x) => x.calm), 1.28) * 100).toFixed(1)}%, wild ${(cover(all.filter((x) => !x.calm), 1.28) * 100).toFixed(1)}%) · z for 80%: ${z80.toFixed(2)} · z for 95%: ${q(all.map((x) => x.z), 0.95).toFixed(2)}`,
    );
  }
  if (index) {
    for (const h of H) {
      const all = zs(index, h, from, to);
      if (!all.length) continue;
      console.log(`KSE-100 ${h}d: ${all.length} cases · inside with 1.28: ${(cover(all, 1.28) * 100).toFixed(1)}% · z for 80%: ${q(all.map((x) => x.z), 0.8).toFixed(2)}`);
    }
  }
}
// check the chosen multipliers on the later period
const chosen = (process.env.Z ?? '').split(',').map(Number);
if (chosen.length === 3 && chosen.every((x: number) => x > 0)) {
  console.log('\n== chosen multipliers on 2022+');
  H.forEach((h, k) => {
    const all = series.flatMap((s) => zs(s, h, 2022, 2030));
    const byYear = new Map<number, number[]>();
    for (const x of all) byYear.set(x.year, [...(byYear.get(x.year) ?? []), x.z]);
    console.log(`${h}d z=${chosen[k]}: ${(cover(all, chosen[k]) * 100).toFixed(1)}% inside · by year ${[...byYear].map(([y, z]) => `${y} ${((z.filter((v) => v <= chosen[k]).length / z.length) * 100).toFixed(0)}%`).join(', ')}`);
    if (index) {
      const ia = zs(index, h, 2022, 2030);
      console.log(`   KSE-100: ${(cover(ia, chosen[k]) * 100).toFixed(1)}% inside`);
    }
  });
}
