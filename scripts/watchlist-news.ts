/**
 * Evening news check for the watchlist (runs after the daily picks).
 *   WATCHLIST_SYMBOLS=LUCK,OGDC,…  NTFY_ALERT_TOPIC=…  tsx scripts/watchlist-news.ts <state dir>
 *
 * Sends one notification listing new PSX announcements (board meetings, material
 * information, payouts, results…) for the stocks in WATCHLIST_SYMBOLS, the ones
 * you follow but may not hold. Holdings already get results and meetings from
 * the portfolio alerts.
 *
 * The repository and its logs are public: the script prints counts only, and the
 * announcements already sent are remembered as keyed hashes (keyed with the
 * secret topic), so the saved state can't be matched to stocks.
 */
import { createHmac } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchCompany } from '../src/psx/api';
import type { CompanyInfo } from '../src/psx/types';
import { kindOf } from '../src/analysis/announcements';
import { NTFY } from '../src/picks/config';
import { newsLines } from '../src/analysis/watchNews';

const [stateDir] = process.argv.slice(2);
const symbols: string[] = [
  ...new Set<string>(
    (process.env.WATCHLIST_SYMBOLS ?? '')
      .split(/[\s,]+/)
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean),
  ),
].slice(0, 40);
const topic = process.env.NTFY_ALERT_TOPIC ?? '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!symbols.length || !topic) {
    console.log('Watchlist news: WATCHLIST_SYMBOLS or NTFY_ALERT_TOPIC secret not set; skipped');
    return;
  }
  const path = join(stateDir, 'news-sent.txt');
  const sent = new Set(existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []);
  const first = sent.size === 0;
  const hash = (k: string) => createHmac('sha256', topic).update(k).digest('hex').slice(0, 20);
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const found: { symbol: string; title: string; date: string; kind: ReturnType<typeof kindOf>; h: string }[] = [];
  let checked = 0;
  for (const sym of symbols) {
    let company: CompanyInfo | null = null;
    for (let a = 0; a < 3 && !company; a++) {
      try {
        company = await fetchCompany(sym);
      } catch {
        await sleep(2500 * (a + 1));
      }
    }
    if (!company) continue;
    checked++;
    for (const a of company.announcements ?? []) {
      const h = hash(`${sym}|${a.date}|${a.title}`);
      if (sent.has(h)) continue;
      found.push({ symbol: sym, title: a.title, date: a.date, kind: kindOf(a), h });
    }
    await sleep(400);
  }
  const lines = newsLines(found, today);
  console.log(`Watchlist news: ${checked} of ${symbols.length} checked, ${lines.length} new`);
  // the first run only learns what's already there, so it doesn't send a year of old notices
  if (!first && lines.length && process.env.PRINT_ALERTS !== '1') {
    const only = new Set(lines.map((l) => l.symbol)).size === 1 ? lines[0].symbol : '';
    const res = await fetch(`${NTFY}/${topic}`, {
      method: 'POST',
      body: lines.map((l) => l.text).join('\n'),
      headers: {
        Title: `Sahm: news on ${new Set(lines.map((l) => l.symbol)).size === 1 ? lines[0].symbol : `${new Set(lines.map((l) => l.symbol)).size} watchlist stocks`}`,
        Tags: 'newspaper',
        Click: only ? `sahm://stock/${only}` : 'sahm://announcements',
      },
    });
    console.log(`Watchlist news sent: ${res.status}`);
    if (!res.ok) return;
  }
  for (const f of found) sent.add(f.h);
  // keep the file small: newest few thousand
  writeFileSync(path, [...sent].slice(-4000).join('\n'));
}

main().catch((e) => console.log(`Watchlist news failed: ${(e as Error).message.replace(/[A-Z]{2,}/g, '…')}`));
