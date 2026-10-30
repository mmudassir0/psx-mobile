import { cached, clearMemory, memoryStore, setStorage } from '../src/psx/cache';
import { dailyCandles, FULL_EVERY_MS, HistoryDeps, lastSource, monthsBetween, topUp } from '../src/psx/history';
import type { Candle } from '../src/psx/types';
import { actionGapAt, adjustCandles, adjustOldGaps } from '../src/psx/parse';
import { recentGap } from '../src/psx/history';

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed++;
}

(async () => {
  const disk = memoryStore();
  setStorage(disk);
  let t = Date.UTC(2026, 9, 15, 6);
  const now = () => t;

  // Generic cache
  let loads = 0;
  const load = async () => (++loads, `v${loads}`);
  await cached('k', 1000, load, { now });
  const second = await cached('k', 1000, load, { now });
  check('fresh entry is reused, not downloaded again', loads === 1 && second === 'v1');
  const [a, b] = await Promise.all([cached('k2', 1000, load, { now }), cached('k2', 1000, load, { now })]);
  check('two callers at once share one download', loads === 2 && a === b);
  check('force downloads again', (await cached('k', 1000, load, { now, force: true })) === 'v3');
  t += 2000;
  const stale = await cached('k', 1000, async () => { throw new Error('offline'); }, { now });
  check('offline: last copy instead of an error', stale === 'v3');
  await cached('p', 1000, load, { now, persist: true });
  clearMemory();
  const fromDisk = await cached('p', 1000, async () => 'network', { now, persist: true });
  check('persisted entries survive an app restart', fromDisk === 'v4' && disk.map.has('p'));
  let threw = false;
  await cached('none', 1000, async () => { throw new Error('x'); }, { now }).catch(() => (threw = true));
  check('no copy and no network: the error is reported', threw);

  // after the close, a price download from after the session stays fresh until the next open
  t = Date.UTC(2026, 9, 16, 13); // Fri 18:00 PKT, after the close
  let pl = 0;
  const priced = async () => (++pl, 'p');
  await cached('eod:TEST', 60_000, priced, { now });
  t = Date.UTC(2026, 9, 18, 10); // Sun 15:00 PKT
  await cached('eod:TEST', 60_000, priced, { now });
  check('weekend: closing prices are not downloaded again', pl === 1);
  await cached('news:x', 60_000, priced, { now });
  await cached('news:x', 60_000, priced, { now });
  t += 120_000;
  await cached('news:x', 60_000, priced, { now });
  check('other downloads keep their TTL', pl === 3);
  t = Date.UTC(2026, 9, 19, 5); // Mon 10:00 PKT, trading
  await cached('eod:TEST', 60_000, priced, { now });
  check('next session: prices are downloaded again', pl === 4);

  // Months and merging
  const m = monthsBetween(Date.UTC(2025, 10, 28), Date.UTC(2026, 0, 3));
  check('months across a year end', JSON.stringify(m) === JSON.stringify([{ year: 2025, month: 11 }, { year: 2025, month: 12 }, { year: 2026, month: 1 }]), m);
  check('month boundary uses Pakistan time', monthsBetween(Date.UTC(2026, 8, 30, 20), Date.UTC(2026, 8, 30, 20))[0].month === 10);
  const bar = (d: number, c: number): Candle => ({ t: Date.UTC(2026, 8, d) - 5 * 3600e3, o: c, h: c, l: c, c, v: 100 });
  const saved = [bar(1, 100), bar(2, 101), bar(3, 102)];
  const merged = topUp(saved, [bar(2, 101), bar(3, 102.2), bar(4, 103)]);
  check('new days are added after the last saved day matches', merged?.length === 4 && merged[3].c === 103 && merged[2].c === 102);
  const afterSplit = [bar(1, 50), bar(2, 51), bar(3, 52)]; // saved after a full download adjusted a split on day 3
  check('a split earlier this month (already adjusted) doesn\'t force a download every time', topUp(afterSplit, [bar(1, 100), bar(2, 102), bar(3, 52), bar(4, 53)])?.length === 4);
  const afterDiv = [bar(1, 100), bar(2, 85), bar(3, 86)]; // a big dividend gap already saved
  check('an old gap that is already saved doesn\'t force a download every time', topUp(afterDiv, [bar(1, 100), bar(2, 85), bar(3, 86), bar(4, 87)])?.length === 4);
  check('the last saved day not in the new data forces a full download', topUp(saved, [bar(4, 103)]) === null);
  check('a split (prices no longer line up) forces a full download', topUp(saved, [bar(3, 20.4), bar(4, 20.6)]) === null);
  check('no overlap forces a full download', topUp(saved, [bar(10, 100)]) === null);
  check('a bonus issue since the last download (a gap beyond the 10% daily limit) forces a full download', topUp(saved, [bar(3, 102), bar(4, 85)]) === null);
  check('a normal fall within the daily limit is just added', topUp(saved, [bar(3, 102), bar(4, 93)])?.length === 4);
  check('gap rule: beyond 10% and more than Rs 1', actionGapAt([bar(1, 100), bar(2, 80)], 1) === 0.8 && actionGapAt([bar(1, 100), bar(2, 91)], 1) === null && actionGapAt([bar(1, 5), bar(2, 4.2)], 1) === null);
  const old = adjustOldGaps([bar(1, 120), bar(2, 120), bar(3, 100), bar(4, 101)], 4);
  check('older bonus issues are adjusted from the gap', old[0].c === 100 && old[1].c === 100 && old[2].c === 100 && old[3].c === 101, old.map((b) => b.c));
  const withEod = adjustCandles([bar(1, 120), bar(2, 100), bar(3, 101), bar(4, 102)], [{ t: bar(3, 0).t, v: 101, vol: 0 }, { t: bar(4, 0).t, v: 102, vol: 0 }]);
  check('a gap before PSX\'s adjusted series starts is adjusted too', withEod[0].c === 100, withEod.map((b) => b.c));
  check('recent unadjusted gap is noticed, an older one is not retried', recentGap([bar(1, 100), bar(2, 80)]) && !recentGap([bar(1, 100), bar(2, 95)]) && !recentGap([bar(1, 100), bar(2, 80), bar(3, 81), bar(4, 82)]));

  // Daily history with fake PSX
  clearMemory();
  const calls: string[] = [];
  const days = (from: number, to: number, f = 1) => Array.from({ length: to - from + 1 }, (_, i) => bar(from + i, (100 + from + i) * f));
  let split = 1;
  const deps: HistoryDeps = {
    now,
    full: async () => (calls.push('full'), days(1, 10, split)),
    month: async (_s, y, mo) => (calls.push(`month ${y}-${mo}`), days(1, 12, split)),
  };
  t = Date.UTC(2026, 8, 12);
  await dailyCandles('LUCK', {}, deps);
  check('first visit downloads the full history', calls.join() === 'full' && lastSource === 'full');
  calls.length = 0;
  await dailyCandles('LUCK', {}, deps);
  check('reopening within 30 minutes downloads nothing', calls.length === 0 && lastSource === 'saved');
  clearMemory();
  t += 31 * 60_000;
  const topped = await dailyCandles('LUCK', {}, deps);
  check('later: only the current month is fetched and added', calls.join() === 'month 2026-9' && lastSource === 'topped-up' && topped.length === 12, calls);
  calls.length = 0;
  split = 0.2;
  t += 31 * 60_000;
  await dailyCandles('LUCK', {}, deps);
  check('after a split the full history is downloaded again', calls.join() === 'month 2026-9,full' && lastSource === 'full', calls);
  calls.length = 0;
  t += FULL_EVERY_MS + 1;
  await dailyCandles('LUCK', {}, deps);
  check('a full refresh happens weekly', calls.join() === 'full', calls);
  calls.length = 0;
  t += 31 * 60_000;
  const offline = await dailyCandles('LUCK', {}, { ...deps, month: async () => { throw new Error('offline'); }, full: async () => { throw new Error('offline'); } });
  check('offline: saved history is shown', offline.length === 10 && lastSource === 'stale');
  t += 1000;
  await dailyCandles('LUCK', { force: true }, deps);
  check('pull to refresh goes to the network even when fresh', calls.length === 1);

  if (failed) {
    console.log(`\n${failed} cache check(s) failed`);
    process.exit(1);
  }
  console.log('\nall cache checks passed');
})();
