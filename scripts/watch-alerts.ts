/**
 * Evening price alerts (runs after the daily picks).
 *   WATCH_ALERTS="SYS<100, LUCK>200d" NTFY_ALERT_TOPIC=…  tsx scripts/watch-alerts.ts <state dir>
 *
 * Sends one notification listing every rule whose line the close crossed
 * today. The repository and its Actions logs are public, so this prints counts
 * only, never the symbols or prices.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KeyValueStore, setStorage } from '../src/psx/cache';
import { dailyCandles } from '../src/psx/history';
import { crossedToday, describeRule, parseRules } from '../src/analysis/watch';
import { NTFY } from '../src/picks/config';

const [stateDir] = process.argv.slice(2);
const topic = process.env.NTFY_ALERT_TOPIC ?? '';
const { rules, bad } = parseRules(process.env.WATCH_ALERTS ?? '');

async function main() {
  if (!rules.length || !topic) {
    console.log(`Price alerts: ${rules.length ? 'NTFY_ALERT_TOPIC' : 'WATCH_ALERTS'} not set; skipped`);
    return;
  }
  const dir = join(stateDir, 'cache');
  const file = (k: string) => join(dir, encodeURIComponent(k).replace(/%/g, '_') + '.json');
  const store: KeyValueStore = { get: async (k) => (existsSync(file(k)) ? readFileSync(file(k), 'utf8') : null), set: async () => {} };
  setStorage(store);
  const hits: string[] = [];
  let checked = 0;
  let lastT = 0;
  for (const r of rules) {
    const c = await dailyCandles(r.symbol).catch(() => null);
    if (!c || c.length < 2) continue;
    checked++;
    lastT = Math.max(lastT, c[c.length - 1].t);
    const closes = c.map((b) => b.c);
    if (crossedToday(r, closes)) hits.push(`${describeRule(r)}: closed at ${closes[closes.length - 1].toFixed(2)}`);
  }
  console.log(`Price alerts: ${checked} of ${rules.length} rules checked, ${hits.length} crossed, ${bad.length} unreadable`);
  if (!hits.length || process.env.PRINT_ALERTS === '1') return;
  // the evening run can start twice (GitHub's schedule and a manual start): send once per trading day
  const sentPath = join(stateDir, 'watch-sent.txt');
  const dayKey = new Date(lastT + 5 * 3600_000).toISOString().slice(0, 10);
  if (existsSync(sentPath) && readFileSync(sentPath, 'utf8').trim() === dayKey) return console.log('Price alerts: already sent for this trading day');
  const only = hits.length === 1 ? rules.find((r) => hits[0].startsWith(r.symbol))?.symbol : undefined;
  const res = await fetch(`${NTFY}/${topic}`, {
    method: 'POST',
    body: hits.join('\n'),
    headers: { Title: `Sahm: ${hits.length} price alert${hits.length > 1 ? 's' : ''}`, Tags: 'bell', Click: only ? `sahm://stock/${only}` : 'sahm://home' },
  });
  console.log(`Price alerts sent: ${res.status}`);
  if (res.ok) writeFileSync(sentPath, dayKey);
}
main().catch((e) => console.log(`Price alerts failed: ${(e as Error).message.replace(/[A-Z]{2,}/g, '…')}`));
