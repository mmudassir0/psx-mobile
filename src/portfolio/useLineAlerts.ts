/**
 * Alerts on your own chart lines: when Sahm loads the latest close and a stock
 * has closed across one of your lines, a notification says so (once per line
 * and day). Checked on the phone when Sahm opens or refreshes; level lines can
 * also be added to the evening price alerts.
 */
import { useEffect } from 'react';
import { makePref } from '../prefs';
import { dailyCandles } from '../psx/history';
import { notifyNow } from '../notify';
import { crossings } from '../analysis/chartLines';
import { chartLinesPref } from './prefs';
import { eachLimit } from '../limit';

export const lineAlertsSentPref = makePref<string[]>('ui.lineAlertsSent', []);
const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export async function checkLineAlerts(): Promise<number> {
  const lines = await chartLinesPref.get();
  const sent = new Set(await lineAlertsSentPref.get());
  const found: { symbol: string; text: string; key: string }[] = [];
  await eachLimit(
    Object.keys(lines).filter((s) => lines[s].levels.length || lines[s].trends.length),
    2,
    async (s) => {
      const c = await dailyCandles(s).catch(() => null);
      if (!c?.length) return;
      // only a close from the last few days is news
      if (Date.now() - c[c.length - 1].t > 4 * 864e5) return;
      for (const x of crossings(c, lines[s])) {
        const key = `${s}:${x.key}`;
        if (sent.has(key)) continue;
        sent.add(key);
        found.push({ symbol: s, key, text: `${s} closed ${x.dir} ${x.what} (Rs ${x.value.toFixed(2)} on ${pk(c[c.length - 1].t)})` });
      }
    },
  );
  if (!found.length) return 0;
  await lineAlertsSentPref.set([...sent].slice(-300));
  const only = new Set(found.map((f) => f.symbol)).size === 1 ? found[0].symbol : null;
  await notifyNow(found.length === 1 ? `${found[0].symbol} crossed your line` : `${found.length} stocks crossed your lines`, found.map((f) => f.text).join('\n'), only ? `sahm://stock/${only}` : 'sahm://home');
  return found.length;
}

/** On Home, after prices load. */
export function useLineAlerts(ready: boolean) {
  const lines = chartLinesPref.use();
  const sig = Object.entries(lines)
    .map(([s, l]) => `${s}${l.levels.length}${l.trends.length}`)
    .join();
  useEffect(() => {
    if (!ready || !sig) return;
    checkLineAlerts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig]);
}
