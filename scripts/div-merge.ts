/**
 * Joins the dividend history job's shards (divs-<n>.json) into divs.json.
 *   tsx scripts/div-merge.ts <state dir> <shards dir>
 * Prints how many companies are left, for the next run.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const [stateDir, shardsDir] = process.argv.slice(2);
const base = join(stateDir, 'divs.json');
const st = existsSync(base) ? JSON.parse(readFileSync(base, 'utf8')) : { updated: '', from: '2016-07-01', symbols: {} };
let left = 0;
let added = 0;
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) walk(join(d, f.name));
    else files.push(join(d, f.name));
  }
};
if (existsSync(shardsDir)) walk(shardsDir);
for (const f of files) {
  if (/divs-\d+\.json$/.test(f)) {
    const s = JSON.parse(readFileSync(f, 'utf8'));
    for (const [sym, v] of Object.entries(s.symbols ?? {})) {
      const nv = v as { done?: boolean; v?: number };
      if (!nv.done) continue;
      // every shard carries the whole file it started from: only a newer reading may replace what's here,
      // or one shard's old copy of a company would undo another shard's new reading of it
      const cur = st.symbols[sym] as { done?: boolean; v?: number } | undefined;
      if (cur?.done && (cur.v ?? 1) >= (nv.v ?? 1)) continue;
      if (!cur?.done || (cur.v ?? 1) < (nv.v ?? 1)) added++;
      st.symbols[sym] = v;
    }
    for (const k of ['shariah', 'kmi30', 'kse100']) if (Array.isArray(s[k]) && s[k].length) st[k] = s[k];
  }
  if (/left-\d+\.txt$/.test(f)) left += Number(readFileSync(f, 'utf8')) || 0;
}
st.updated = new Date().toISOString();
writeFileSync(base, JSON.stringify(st));
writeFileSync(join(stateDir, 'left.txt'), String(left));
writeFileSync(join(stateDir, 'added.txt'), String(added));
const all = Object.values(st.symbols) as { list: unknown[] }[];
console.log(`merged ${files.filter((f) => /divs-\d+/.test(f)).length} shards: ${added} new companies, ${all.length} in all, ${all.reduce((a, s) => a + s.list.length, 0)} dividends, ${left} left`);
