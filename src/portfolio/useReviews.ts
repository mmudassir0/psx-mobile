/** Loads what each holding's review needs (shared cache, one stock at a time) and reviews it. */
import { useEffect, useMemo, useState } from 'react';
import type { CompanyInfo, Stock } from '../psx/types';
import { fetchCompany, fetchPayouts } from '../psx/api';
import { dividends, Dividends, Payout } from '../analysis/dividends';
import { fiscalEndMonth } from '../analysis/fairValue';
import { cached, COMPANY_TTL } from '../psx/cache';
import { dailyCandles } from '../psx/history';
import { analyze, computeSeries } from '../analysis/signals';
import { balanceSheetFor, computeRatios } from '../analysis/ratios';
import { valueStock } from '../analysis/valuation';
import { dataChecks } from '../analysis/quality';
import type { Candle } from '../psx/types';
import { Holding, Review, reviewHolding } from './review';

export interface Row {
  holding: Holding;
  stock?: Stock;
  price: number;
  value: number;
  weight: number;
  review: Review | null;
  dividends: Dividends | null;
}

const FUND = /etf|exchange traded|mutual fund/i;

export function useReviews(holdings: Holding[], stocks: Stock[], bySymbol: Map<string, Stock>, breadth: number | null) {
  const [data, setData] = useState<Record<string, { company: CompanyInfo | null; candles: Candle[] | null; payouts: Payout[] | null }>>({});
  const key = holdings.map((h) => h.symbol).join(',');

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const h of holdings) {
        const [company, candles, payouts] = await Promise.all([
          cached(`company:${h.symbol}`, COMPANY_TTL, () => fetchCompany(h.symbol), { persist: true }).catch(() => null),
          dailyCandles(h.symbol).catch(() => null),
          cached(`payouts:${h.symbol}`, 6 * 3600_000, () => fetchPayouts(h.symbol), { persist: true }).catch(() => null),
        ]);
        if (!alive) return;
        setData((d) => ({ ...d, [h.symbol]: { company, candles, payouts } }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const base = holdings.map((h) => {
      const stock = bySymbol.get(h.symbol);
      const price = stock?.price ?? data[h.symbol]?.company?.close ?? h.avgCost;
      return { holding: h, stock, price, value: h.shares * price };
    });
    const total = base.reduce((a, r) => a + r.value, 0) || 1;
    const sectorW = new Map<string, number>();
    for (const r of base) {
      const k = r.stock?.sector ?? 'Other';
      sectorW.set(k, (sectorW.get(k) ?? 0) + r.value / total);
    }
    const rows: Row[] = base.map((r) => {
      const d = data[r.holding.symbol];
      if (!d) return { ...r, weight: r.value / total, review: null, dividends: null };
      const series = d.candles?.length ? computeSeries(d.candles) : null;
      const balance = balanceSheetFor(r.holding.symbol);
      const ratios = d.company ? computeRatios(balance, d.company, r.stock) : null;
      const peers = r.stock ? stocks.filter((x) => x.sector === r.stock!.sector && x.symbol !== r.holding.symbol) : [];
      const fund = FUND.test(r.stock?.sector ?? '') || FUND.test(d.company?.sector ?? '');
      const fair = d.company && !fund ? valueStock({ symbol: r.holding.symbol, stock: r.stock, company: d.company, ratios, balance, peers, daily: d.candles }) : null;
      const dv = d.payouts
        ? dividends(d.payouts, { price: r.price, divYield: r.stock?.divYield ?? null, fiscalEndMonth: fiscalEndMonth(d.company?.fiscalYearEnd), latestFiscalYear: d.company?.financialsAnnual?.periods[0] ?? null })
        : null;
      const review = reviewHolding({
        holding: r.holding,
        price: r.price,
        weight: r.value / total,
        sector: r.stock?.sector ?? d.company?.sector ?? null,
        sectorWeight: sectorW.get(r.stock?.sector ?? 'Other') ?? 0,
        breadth,
        fund,
        series,
        analysis: d.candles && series ? analyze(d.candles, series) : null,
        company: d.company,
        ratios,
        hasBalanceSheet: !!balance,
        isBank: !!balance?.isBank,
        fair,
        divYield: r.stock?.divYield ?? null,
        dividends: dv,
        checks: dataChecks({ symbol: r.holding.symbol, name: r.stock?.name ?? d.company?.name, sector: r.stock?.sector ?? d.company?.sector, company: d.company, balance, ratios }),
      });
      return { ...r, weight: r.value / total, review, dividends: dv };
    });
    const candles = Object.fromEntries(holdings.map((h) => [h.symbol, data[h.symbol]?.candles ?? null]));
    return { rows, total, candles, sectors: [...sectorW].sort((a, b) => b[1] - a[1]), loading: holdings.some((h) => !data[h.symbol]) };
  }, [holdings, data, stocks, bySymbol, breadth]);
}
