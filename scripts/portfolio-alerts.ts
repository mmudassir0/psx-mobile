/**
 * Evening portfolio check (runs after the daily picks).
 *   HOLDINGS_SYMBOLS=LUCK,OGDC,…  NTFY_ALERT_TOPIC=…  tsx scripts/portfolio-alerts.ts <state dir> <fundamentals.json>
 *
 * Reviews each holding with the same rules as the app, as of today's close and
 * as of the day before, and sends a notification only when something changed:
 * a new Review/Trim, a new fundamental or technical break, a big daily move, a
 * new dividend, a book closure coming up, new financial results (with what
 * the new numbers say and Sahm's decision after them) or a board meeting
 * called, which usually means results within days.
 *
 * The repository is public, so its Actions logs are public too: this script
 * prints counts only, never the symbols. Symbols and the alert topic come from
 * repository secrets. Quantities are never used, so size-based Trim can't be
 * judged here; the app does that.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KeyValueStore, setStorage } from '../src/psx/cache';
import { dailyCandles } from '../src/psx/history';
import { fetchCompany, fetchPayouts, fetchScreener } from '../src/psx/api';
import { analyze, computeSeries } from '../src/analysis/signals';
import { computeRatios } from '../src/analysis/ratios';
import { valueStock } from '../src/analysis/valuation';
import { dataChecks } from '../src/analysis/quality';
import { cashDividends, dividends, exDate, lastBuyDay } from '../src/analysis/dividends';
const pkDayOf = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const nice = (t: number) => new Date(t + 5 * 3600_000).toUTCString().slice(0, 11).replace(',', '');
/** The working day after a candle's day, as YYYY-MM-DD (Pakistan). */
const nextWorkday = (t: number) => {
  let d = t + 12 * 3600_000;
  do d += 864e5;
  while ([0, 6].includes(new Date(d + 5 * 3600_000).getUTCDay()));
  return pkDayOf(d);
};
import { fiscalEndMonth } from '../src/analysis/fairValue';
import { reviewHolding, Review } from '../src/portfolio/review';
import { resultsLine, resultsStatus } from '../src/analysis/results';
import type { Candle, CompanyInfo, Stock } from '../src/psx/types';
import { NTFY } from '../src/picks/config';

const [stateDir, fundPath] = process.argv.slice(2);
const symbols = (process.env.HOLDINGS_SYMBOLS ?? '').split(/[\s,]+/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
const topic = process.env.NTFY_ALERT_TOPIC ?? '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

async function retry<T>(f: () => Promise<T>): Promise<T | null> {
  for (let a = 0; a < 3; a++) {
    try {
      return await f();
    } catch {
      await sleep(3000 * (a + 1));
    }
  }
  return null;
}

async function main() {
  if (!symbols.length || !topic) {
    console.log('Portfolio alerts: HOLDINGS_SYMBOLS or NTFY_ALERT_TOPIC secret not set; skipped');
    return;
  }
  // Use the picks job's saved price histories.
  const dir = join(stateDir, 'cache');
  const file = (k: string) => join(dir, encodeURIComponent(k).replace(/%/g, '_') + '.json');
  const store: KeyValueStore = { get: async (k) => (existsSync(file(k)) ? readFileSync(file(k), 'utf8') : null), set: async () => {} };
  setStorage(store);
  const fund = fundPath && existsSync(fundPath) ? JSON.parse(readFileSync(fundPath, 'utf8')).companies ?? {} : {};
  const screener = new Map(((await retry(fetchScreener)) ?? []).map((r) => [r.symbol, r] as const));
  const breadth = existsSync(join(stateDir, 'market.json')) ? JSON.parse(readFileSync(join(stateDir, 'market.json'), 'utf8')).breadth ?? null : null;

  const lines: string[] = [];
  let checked = 0;
  let lastDay = 0;
  for (const sym of symbols) {
    const candles = await dailyCandles(sym).catch(() => null);
    const company = await retry(() => fetchCompany(sym));
    const payouts = await retry(() => fetchPayouts(sym));
    await sleep(500);
    if (!candles || candles.length < 30) continue;
    checked++;
    const scr = screener.get(sym);
    const peers = scr
      ? [...screener.values()].filter((r) => r.sectorCode === scr.sectorCode && r.symbol !== sym).map((r) => ({ symbol: r.symbol, pe: r.pe, marketCap: r.marketCap, price: r.price }) as Stock)
      : [];
    const review = (c: Candle[], co: CompanyInfo | null): Review => {
      const price = c[c.length - 1].c;
      const stock = { symbol: sym, name: co?.name ?? sym, sector: co?.sector ?? '', price, pe: co?.pe ?? scr?.pe ?? null, divYield: scr?.divYield ?? null, marketCap: co?.shares ? price * co.shares : null } as Stock;
      const balance = fund[sym] ?? null;
      const ratios = co ? computeRatios(balance, co, stock) : null;
      const series = computeSeries(c);
      const fundLike = /etf|exchange traded|mutual/i.test(co?.sector ?? '');
      const dv = payouts && co ? dividends(payouts, { price, divYield: scr?.divYield ?? null, fiscalEndMonth: fiscalEndMonth(co.fiscalYearEnd), latestFiscalYear: co.financialsAnnual?.periods[0] ?? null }) : null;
      return reviewHolding({
        holding: { symbol: sym, shares: 1, avgCost: price },
        price,
        weight: 0.05,
        sector: co?.sector ?? null,
        sectorWeight: 0,
        breadth,
        fund: fundLike,
        series,
        analysis: analyze(c, series),
        company: co,
        ratios,
        hasBalanceSheet: !!balance,
        isBank: !!balance?.isBank || /commercial bank/i.test(co?.sector ?? ''),
        // Same sector peers as the app uses, so the alert and the app agree on fair value.
        fair: co && !fundLike ? valueStock({ symbol: sym, stock, company: co, ratios, balance, peers, daily: c }, (s) => fund[s] ?? null) : null,
        divYield: scr?.divYield ?? null,
        dividends: dv,
        checks: co ? dataChecks({ symbol: sym, name: co.name, sector: co.sector, company: co, balance, ratios }) : null,
      });
    };
    const today = review(candles, company);
    const before = review(candles.slice(0, -1), company);
    const n = candles.length - 1;
    const move = candles[n].c / candles[n - 1].c - 1;
    const notes: string[] = [];
    if (today.action !== before.action && (today.action === 'Review' || today.action === 'Trim' || today.action === 'Add more')) notes.push(`now ${today.action}: ${today.headline}`);
    // Compare the kind of break, not its wording: the numbers in it change every day.
    const kind = (t: string) => t.replace(/\([^)]*\)/g, '').replace(/[\d.,%]+/g, '#').replace(/Rs\s*#/g, '#').trim();
    const had = (list: string[], t: string) => list.some((x) => kind(x) === kind(t));
    for (const t of today.technicalBreaks) if (!had(before.technicalBreaks, t)) notes.push(`chart: ${t}`);
    for (const t of today.fundamentalBreaks) if (!had(before.fundamentalBreaks, t)) notes.push(`business: ${t}`);
    const lastBar = candles[n].t;
    if (lastBar > lastDay) lastDay = lastBar;
    const dvNow = payouts && company ? dividends(payouts, { price: candles[n].c, divYield: scr?.divYield ?? null, fiscalEndMonth: fiscalEndMonth(company.fiscalYearEnd) }) : null;
    if (Math.abs(move) >= 0.05) {
      // On the ex-date the price drops by about the dividend; that isn't a loss for holders.
      const dvToday = payouts && company ? cashDividends(dividends(payouts, { price: candles[n].c, divYield: scr?.divYield ?? null, fiscalEndMonth: fiscalEndMonth(company.fiscalYearEnd) })).find((x) => pkDayOf(x.exT) === pkDayOf(lastBar)) : null;
      if (dvToday && move < 0) notes.push(`down ${(Math.abs(move) * 100).toFixed(1)}% today, mostly because it went ex-dividend (Rs ${dvToday.dps.toFixed(2)} a share, which holders receive)`);
      else notes.push(`${move > 0 ? 'up' : 'down'} ${(Math.abs(move) * 100).toFixed(1)}% today`);
    }
    for (const p of payouts ?? []) {
      if (p.announced > lastBar - 2 * DAY && p.items.length) notes.push(`announced ${p.items.map((i) => `${i.pct}%${i.tag ? `(${i.tag})` : ''} ${i.type === 'D' ? 'cash dividend' : i.type === 'B' ? 'bonus shares' : 'right shares'}`).join(' + ')}`);
      // Once, the evening before the last day to buy: that's when there is still time to act.
      if (p.bookClosure && p.bookClosure > lastBar && pkDayOf(lastBuyDay(p.bookClosure)) === nextWorkday(lastBar)) {
        const what = p.items.map((i) => `${i.pct}% ${i.type === 'D' ? 'cash dividend' : i.type === 'B' ? 'bonus shares' : 'right shares'}`).join(' + ');
        const cashRs = dvNow?.list.find((x) => x.bookClosure === p.bookClosure)?.dps ?? 0;
        notes.push(
          `${what}${cashRs > 0 ? ` (about Rs ${cashRs.toFixed(2)} a share before tax)` : ''}: tomorrow (${nice(lastBuyDay(p.bookClosure))}) is the last day to buy and still get it. ` +
            `You already hold it, so you'll get it if you don't sell by tomorrow's close; selling from ${nice(exDate(p.bookClosure))} keeps the payout. Book closure starts ${nice(p.bookClosure)}.`,
        );
      }
    }
    // Results season: the review above already uses the new numbers when PSX has updated them.
    const rs = company ? resultsStatus(company, lastBar + DAY) : null;
    const recent = (d: string) => Date.parse(d + 'T12:00:00Z') > lastBar - 2 * DAY;
    if (rs?.latest && recent(rs.latest.date)) notes.push(`${resultsLine(rs.latest)}. Sahm now says ${today.action}${today.watch ? ' (watch)' : ''}`);
    else if (rs?.meetingNotice && recent(rs.meetingNotice.date)) notes.push('board meeting called: results probably due within days');
    if (notes.length) lines.push(`${sym}: ${notes.join('; ')}`);
  }
  console.log(`Portfolio alerts: ${checked} of ${symbols.length} holdings checked, ${lines.length} with news`);
  // Local testing only: never set in the workflow, whose logs are public.
  if (process.env.PRINT_ALERTS === '1') console.log(lines.join('\n'));
  if (!lines.length || process.env.PRINT_ALERTS === '1') return;
  // The evening run can be started twice (GitHub's schedule and a manual start): send once per trading day.
  const sentPath = join(stateDir, 'alerts-sent.txt');
  const dayKey = lastDay ? pkDayOf(lastDay) : '';
  if (dayKey && existsSync(sentPath) && readFileSync(sentPath, 'utf8').trim() === dayKey) {
    console.log('Portfolio alerts: already sent for this trading day');
    return;
  }
  // Tapping the notification opens the app (v0.23+) at the holding, or at the portfolio when there are several.
  const only = lines.length === 1 ? lines[0].slice(0, lines[0].indexOf(':')) : '';
  const res = await fetch(`${NTFY}/${topic}`, {
    method: 'POST',
    body: lines.join('\n'),
    headers: { Title: `Sahm: ${lines.length} holding${lines.length > 1 ? 's' : ''} to look at`, Tags: 'chart_with_downwards_trend', Click: only ? `sahm://stock/${only}` : 'sahm://portfolio' },
  });
  console.log(`Portfolio alerts sent: ${res.status}`);
  if (res.ok && dayKey) writeFileSync(sentPath, dayKey);
}
main().catch((e) => {
  // keep the log free of holdings
  console.log(`Portfolio alerts failed: ${(e as Error).message.replace(/[A-Z]{2,}/g, '…')}`);
});
