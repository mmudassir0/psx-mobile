/**
 * Saves each listed company's sector, shares, fiscal year end, P/E and annual
 * results, for backtesting fair value. Reads the symbol list from a price
 * history index.json (fetch-history.ts) when given, else from PSX.
 *   tsx scripts/fetch-companies.ts <out dir> [history index.json]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchCompany, fetchIndexConstituents, fetchSymbols } from '../src/psx/api';

const out = process.argv[2] ?? 'companies';
mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await sleep(4000 * (i + 1));
    }
  }
  throw last;
}

async function main() {
  const idx = process.argv[3];
  const symbols: string[] =
    idx && existsSync(idx)
      ? Object.keys(JSON.parse(readFileSync(idx, 'utf8')).ok)
      : (await retry(() => fetchIndexConstituents('ALLSHR'))).map((c) => c.symbol);
  const sectors = Object.fromEntries((await retry(fetchSymbols)).map((s) => [s.symbol, s.sectorName]));
  const budget = Date.now() + Number(process.env.BUDGET_MIN ?? 150) * 60_000;
  let ok = 0;
  const failed: string[] = [];
  for (const s of symbols) {
    if (Date.now() > budget) break;
    try {
      const c = await retry(() => fetchCompany(s));
      writeFileSync(
        join(out, `${s}.json`),
        JSON.stringify({ symbol: s, sector: c.sector ?? sectors[s] ?? null, shares: c.shares, pe: c.pe, fiscalYearEnd: c.fiscalYearEnd, annual: c.financialsAnnual, quarterly: c.financialsQuarterly }),
      );
      ok++;
      console.log(`${s} ok`);
    } catch (e) {
      failed.push(s);
      console.log(`${s}: FAILED ${(e as Error).message}`);
    }
    await sleep(800);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify({ fetched: new Date().toISOString(), ok, failed }, null, 1));
  console.log(`done: ${ok} ok, ${failed.length} failed`);
}
main();
