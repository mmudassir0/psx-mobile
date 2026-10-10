/** Hits the real PSX portal through the app's own client. Run in CI. */
import { fetchBoard, fetchCompany, fetchIndices, fetchScreener, fetchSeries, fetchSymbols } from '../src/psx/api';

async function step<T>(label: string, fn: () => Promise<T>, describe: (v: T) => string) {
  const t = Date.now();
  try {
    const v = await fn();
    console.log(`OK    ${label} (${Date.now() - t} ms): ${describe(v)}`);
    return true;
  } catch (e) {
    console.log(`FAIL  ${label}: ${(e as Error).message}`);
    return false;
  }
}

(async () => {
  const results = [
    await step('indices', fetchIndices, (v) => `${v.length} rows, KSE100 ${v.find((i) => i.code === 'KSE100')?.current}`),
    await step('trading board', fetchBoard, (v) => `${v.length} rows, LUCK ${v.find((b) => b.symbol === 'LUCK')?.price}`),
    await step('symbols', fetchSymbols, (v) => `${v.length} symbols`),
    await step('eod LUCK', () => fetchSeries('eod', 'LUCK'), (v) => `${v.length} points, last ${v[v.length - 1]?.v}`),
    await step('intraday LUCK', () => fetchSeries('int', 'LUCK'), (v) => `${v.length} points`),
    await step('company LUCK', () => fetchCompany('LUCK'), (v) => `${v.name}, close ${v.close}, ${v.announcements.length} announcements`),
    await step('screener', fetchScreener, (v) => `${v.length} rows, ${v.filter((s) => s.shariah).length} Shariah`),
  ];
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} live checks failed` : '\nall live checks passed');
  process.exit(failed ? 1 : 0);
})();
