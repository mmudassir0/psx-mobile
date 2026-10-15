/** Builds the fair-value input from the data a stock page already has. */
import type { Candle, CompanyInfo, Stock } from '../psx/types';
import { balanceSheetFor, BalanceSheet, Ratios } from './ratios';
import { fairValue, FairValue, PeerValuation } from './fairValue';

export function peerValuations(peers: Stock[], bookFor: (s: string) => BalanceSheet | null = balanceSheetFor): PeerValuation[] {
  return peers.map((p) => {
    const bs = bookFor(p.symbol);
    return { symbol: p.symbol, pe: p.pe, pb: bs && bs.equity > 0 && p.marketCap ? p.marketCap / bs.equity : null };
  });
}

export function valueStock(
  args: { symbol: string; stock?: Stock; company: CompanyInfo | null; ratios: Ratios | null; balance: BalanceSheet | null; peers: Stock[]; daily?: Candle[] | null },
  bookFor?: (s: string) => BalanceSheet | null,
): FairValue | null {
  const { stock, company } = args;
  const price = stock?.price ?? company?.close ?? null;
  if (price == null) return null;
  return fairValue({
    symbol: args.symbol,
    price,
    pe: company?.pe ?? stock?.pe ?? null,
    shares: company?.shares ?? null,
    sector: stock?.sector ?? company?.sector ?? null,
    annual: company?.financialsAnnual ?? null,
    fiscalYearEnd: company?.fiscalYearEnd ?? null,
    bookValuePerShare: args.ratios?.bookValuePerShare ?? null,
    roe: args.ratios?.roe ?? null,
    isBank: args.balance?.isBank ?? /bank/i.test(stock?.sector ?? ''),
    peers: peerValuations(args.peers, bookFor),
    daily: args.daily ?? undefined,
  });
}
