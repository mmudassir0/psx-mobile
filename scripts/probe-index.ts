/** Real index history: trend, past falls; saves KSE-100's closes for local checks. */
import { writeFileSync } from 'fs';
import { fetchSeries } from '../src/psx/api';
import { indexTrend } from '../src/analysis/market';
import { drawdowns } from '../src/portfolio/stress';

const day = (t: number) => new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
async function retry<T>(f: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw last;
}
(async () => {
  for (const code of ['KSE100', 'KMI30', 'ALLSHR']) {
    const pts = await retry(() => fetchSeries('eod', code));
    if (code === 'KSE100') writeFileSync('/tmp/out/kse100.json', JSON.stringify(pts));
    const t = indexTrend(pts);
    console.log(`\n${code}: ${pts.length} days, ${day(pts[0].t)} → ${day(pts[pts.length - 1].t)}, last ${pts[pts.length - 1].v}`);
    if (t) console.log(`  ${t.regime} for ${t.days} days since ${day(t.since)}; 50d ${t.ma50.toFixed(0)}, 200d ${t.ma200.toFixed(0)} (${(t.slope200 * 100).toFixed(1)}%/20d); range ${t.rangeLow.toFixed(0)}–${t.rangeHigh.toFixed(0)}; S ${t.support?.toFixed(0)} R ${t.resistance?.toFixed(0)}; from high ${(t.fromHigh * 100).toFixed(1)}%; 1m ${((t.returns.m1 ?? 0) * 100).toFixed(1)}% ytd ${((t.returns.ytd ?? 0) * 100).toFixed(1)}% 1y ${((t.returns.y1 ?? 0) * 100).toFixed(1)}%`);
    for (const e of drawdowns(pts)) console.log(`  fall ${day(e.peakT)} → ${day(e.troughT)}: ${(e.fall * 100).toFixed(1)}%, recovered ${e.recoveredT ? day(e.recoveredT) : 'not yet'}`);
  }
})().catch((e) => console.log('ERROR', e));
