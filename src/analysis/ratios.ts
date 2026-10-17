/**
 * Financial ratios computed in the app.
 *
 * Inputs: the balance sheet extracted from the company's own report
 * (assets/fundamentals.json, built by scripts/fundamentals), PSX's income
 * figures and P/E, and the live price. Profit uses the trailing twelve months
 * implied by PSX's P/E (price ÷ P/E × shares) when available, otherwise the
 * latest fiscal year.
 */
import type { CompanyInfo, Stock } from '../psx/types';

export interface BalanceSheet {
  periodEnd: string | null;
  statement: string | null;
  isBank: boolean;
  equity: number;
  assets: number;
  liabilities: number;
  currentAssets: number | null;
  currentLiabilities: number | null;
  borrowings: number | null;
  cash: number | null;
  warnings?: string[];
  source: { title: string; url: string; date: string; pages: number[]; method?: string };
}

export interface Ratios {
  /** profit used for returns, rupees, and where it came from */
  profit: number | null;
  profitBasis: 'ttm' | 'fiscal' | null;
  roe: number | null;
  roa: number | null;
  bookValuePerShare: number | null;
  priceToBook: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  liabilitiesToEquity: number | null;
  equityToAssets: number | null;
  priceToSales: number | null;
  payoutRatio: number | null;
  dividendCover: number | null;
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const div = (a: number | null | undefined, b: number | null | undefined) => (ok(a) && ok(b) && b !== 0 ? a / b : null);

function annualRow(c: CompanyInfo | null, re: RegExp): number | null {
  return c?.financialsAnnual?.rows.find((r) => re.test(r.label))?.values[0] ?? null;
}

export function computeRatios(bs: BalanceSheet | null, company: CompanyInfo | null, stock?: Stock): Ratios {
  const price = stock?.price ?? company?.close ?? null;
  const shares = company?.shares ?? null;
  const pe = company?.pe ?? stock?.pe ?? null;
  const annualEps = annualRow(company, /^EPS$/i);
  const annualProfitK = annualRow(company, /profit after tax/i); // PKR thousands
  const salesK = annualRow(company, /^sales/i);

  let profit: number | null = null;
  let profitBasis: Ratios['profitBasis'] = null;
  if (ok(price) && ok(pe) && pe > 0 && ok(shares)) {
    profit = (price / pe) * shares;
    profitBasis = 'ttm';
  } else if (ok(annualProfitK)) {
    profit = annualProfitK * 1000;
    profitBasis = 'fiscal';
  }

  const marketCap = company?.marketCap ?? stock?.marketCap ?? (ok(price) && ok(shares) ? price * shares : null);
  const dps = ok(stock?.divYield) && ok(price) ? ((stock!.divYield as number) / 100) * price : null;
  const bvps = bs ? div(bs.equity, shares) : null;

  return {
    profit,
    profitBasis,
    roe: bs && bs.equity > 0 ? div(profit, bs.equity) : null,
    roa: bs ? div(profit, bs.assets) : null,
    bookValuePerShare: bvps,
    priceToBook: bvps && bvps > 0 ? div(price, bvps) : null,
    currentRatio: bs && !bs.isBank ? div(bs.currentAssets, bs.currentLiabilities) : null,
    debtToEquity: bs && bs.equity > 0 && ok(bs.borrowings) ? div(bs.borrowings, bs.equity) : null,
    liabilitiesToEquity: bs && bs.equity > 0 ? div(bs.liabilities, bs.equity) : null,
    equityToAssets: bs ? div(bs.equity, bs.assets) : null,
    priceToSales: ok(salesK) && salesK > 0 ? div(marketCap, salesK * 1000) : null,
    payoutRatio: ok(dps) && ok(annualEps) && annualEps > 0 ? dps / annualEps : null,
    dividendCover: ok(dps) && dps > 0 && ok(annualEps) ? annualEps / dps : null,
  };
}

type Store = { generatedAt: string | null; companies: Record<string, BalanceSheet> };
let store: Store | null = null;
let live: Store | null = null;

function bundled(): Store {
  if (!store) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      store = require('../../assets/fundamentals.json') as Store;
    } catch {
      store = { generatedAt: null, companies: {} };
    }
  }
  return store;
}

/**
 * Newer balance sheets downloaded at runtime (the fundamentals job runs daily);
 * used over the copy bundled with the app when they are newer.
 */
export function setLiveFundamentals(s: Store | null) {
  if (!s || typeof s !== 'object' || !s.companies || typeof s.companies !== 'object') return;
  const b = bundled();
  if (b.generatedAt && s.generatedAt && s.generatedAt < b.generatedAt) return;
  live = s;
}

/** Balance sheet for a company (the newest Sahm has), or null when it isn't covered yet. */
export function balanceSheetFor(symbol: string): BalanceSheet | null {
  return live?.companies?.[symbol] ?? bundled().companies?.[symbol] ?? null;
}

/** When the balance sheets in use were extracted. */
export function fundamentalsDate(): string | null {
  return live?.generatedAt ?? bundled().generatedAt ?? null;
}
