/**
 * Evening price alerts (runs after the daily picks).
 *   WATCH_ALERTS="SYS<100, LUCK>200d, MEBL yield>9, LUCK<fair" NTFY_ALERT_TOPIC=…  tsx scripts/watch-alerts.ts <state dir> [fundamentals.json]
 *
 * Sends one notification listing every rule whose line the close crossed
 * today. The repository and its Actions logs are public, so this prints counts
 * only, never the symbols or prices.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KeyValueStore, setStorage } from '../src/psx/cache';
import { dailyCandles } from '../src/psx/history';
import { crossedToday, describeRule, parseRules, type RuleContext, type WatchRule } from '../src/analysis/watch';
import { fetchCompany, fetchPayouts, fetchScreener } from '../src/psx/api';
import { dividends } from '../src/analysis/dividends';
import { fiscalEndMonth } from '../src/analysis/fairValue';
import { computeRatios } from '../src/analysis/ratios';
import { valueStock } from '../src/analysis/valuation';
import type { Stock } from '../src/psx/types';
import { NTFY } from '../src/picks/config';

const [stateDir, fundPath] = process.argv.slice(2);
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
  const fund: Record<string, never> = fundPath && existsSync(fundPath) ? (JSON.parse(readFileSync(fundPath, 'utf8')).companies ?? {}) : {};
  const needsMore = rules.some((r) => r.yield || r.level === 'fair');
  const screener = needsMore ? new Map((await fetchScreener().catch(() => [])).map((r) => [r.symbol, r] as const)) : new Map();
  /** Dividends and fair value, only for the rules that need them. */
  const contextFor = async (r: WatchRule, price: number, daily: Parameters<typeof valueStock>[0]['daily']): Promise<RuleContext> => {
    if (!r.yield && r.level !== 'fair') return {};
    const company = await fetchCompany(r.symbol).catch(() => null);
    const scr = screener.get(r.symbol);
    if (r.yield) {
      const payouts = await fetchPayouts(r.symbol).catch(() => null);
      if (!payouts) return {};
      const d = dividends(payouts, { price, divYield: scr?.divYield ?? null, fiscalEndMonth: fiscalEndMonth(company?.fiscalYearEnd), latestFiscalYear: company?.financialsAnnual?.periods[0] ?? null });
      return { ttmDps: d.ttm };
    }
    if (!company) return {};
    const stock = { symbol: r.symbol, name: company.name, sector: company.sector, price, pe: company.pe ?? scr?.pe ?? null, divYield: scr?.divYield ?? null, marketCap: company.shares ? price * company.shares : null } as Stock;
    const balance = fund[r.symbol] ?? null;
    const ratios = computeRatios(balance, company, stock);
    const peers = scr ? [...screener.values()].filter((x) => x.sectorCode === scr.sectorCode && x.symbol !== r.symbol).map((x) => ({ symbol: x.symbol, pe: x.pe, marketCap: x.marketCap, price: x.price }) as Stock) : [];
    const fair = valueStock({ symbol: r.symbol, stock, company, ratios, balance, peers, daily }, (s) => fund[s] ?? null);
    return { fair: fair ? { low: fair.low, high: fair.high } : null };
  };
  const hits: string[] = [];
  let checked = 0;
  let lastT = 0;
  for (const r of rules) {
    const c = await dailyCandles(r.symbol).catch(() => null);
    if (!c || c.length < 2) continue;
    checked++;
    lastT = Math.max(lastT, c[c.length - 1].t);
    const closes = c.map((b) => b.c);
    const last = closes[closes.length - 1];
    const ctx = await contextFor(r, last, c).catch(() => ({}) as RuleContext);
    if (crossedToday(r, closes, ctx)) {
      const extra = r.yield && ctx.ttmDps ? `, yield ${((ctx.ttmDps / last) * 100).toFixed(1)}%` : r.level === 'fair' && ctx.fair ? `, fair value Rs ${ctx.fair.low.toFixed(0)}–${ctx.fair.high.toFixed(0)}` : '';
      hits.push(`${describeRule(r)}: closed at ${last.toFixed(2)}${extra}`);
    }
  }
  console.log(`Price alerts: ${checked} of ${rules.length} rules checked, ${hits.length} crossed, ${bad.length} unreadable`);
  if (!hits.length || process.env.PRINT_ALERTS === '1') return;
  // the evening run can start twice (GitHub's schedule and a manual start): send once per trading day
  const sentPath = join(stateDir, 'watch-sent.txt');
  const dayKey = new Date(lastT + 5 * 3600_000).toISOString().slice(0, 10);
  if (existsSync(sentPath) && readFileSync(sentPath, 'utf8').trim() === dayKey && process.env.FORCE_ALERTS !== '1') return console.log('Price alerts: already sent for this trading day');
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
