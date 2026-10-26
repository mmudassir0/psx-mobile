/** Your data as an Excel workbook: holdings, trades, dividends, the tax year and the daily values. */
import type { Row } from './useReviews';
import type { TradeRecord } from './trades';
import type { Snap } from './track';
import type { TaxStatement } from './taxStatement';
import type { Sheet } from '../xlsx';

const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 100);
const day = (t: number | null) => (t == null ? null : new Date(t + 5 * 3600_000).toISOString().slice(0, 10));

export function workbook(x: { rows: Row[]; trades: TradeRecord[]; snaps: Snap[]; tax: TaxStatement; made: string }): Sheet[] {
  const total = x.rows.reduce((a, r) => a + r.value, 0);
  const holdings: Sheet = {
    name: 'Holdings',
    rows: [
      ['Symbol', 'Company', 'Sector', 'Shares', 'Average cost', 'Cost', 'Price', 'Value', 'Gain', 'Gain %', 'Weight %', 'Sahm says'],
      ...x.rows.map((r) => {
        const cost = r.holding.shares * r.holding.avgCost;
        return [
          r.holding.symbol,
          r.stock?.name ?? '',
          r.stock?.sector ?? '',
          r.holding.shares,
          r2(r.holding.avgCost),
          r2(cost),
          r2(r.price),
          r2(r.value),
          r2(r.value - cost),
          cost ? pct(r.value / cost - 1) : null,
          total ? pct(r.value / total) : null,
          r.review?.action ?? '',
        ];
      }),
      [],
      ['Total', '', '', '', '', r2(x.rows.reduce((a, r) => a + r.holding.shares * r.holding.avgCost, 0)), '', r2(total)],
    ],
  };
  const trades: Sheet = {
    name: 'Trades',
    rows: [
      ['Date', 'Symbol', 'Side', 'Shares', 'Price', 'Value', 'Average cost before', 'Gain on the sale'],
      ...[...x.trades].sort((a, b) => (a.day < b.day ? -1 : 1)).map((t) => [t.day, t.symbol, t.side === 'buy' ? 'Bought' : 'Sold', t.shares, r2(t.price), r2(t.shares * t.price), r2(t.avgCost), r2(t.realised)]),
    ],
  };
  const dividends: Sheet = {
    name: 'Dividends',
    rows: [
      ['Symbol', 'Announced', 'Book closure', 'Cash per share', 'Bonus %', 'Rights %', 'Period'],
      ...x.rows.flatMap((r) => (r.dividends?.list ?? []).map((p) => [r.holding.symbol, day(p.announced), day(p.bookClosure), r2(p.dps), p.bonusPct || null, p.rightsPct || null, p.period ?? ''])),
    ],
  };
  const t = x.tax;
  const tax: Sheet = {
    name: `Tax year ${t.year}`,
    rows: [
      [`Tax year ${t.year}`, `${t.from} to ${t.to}`],
      ['Net capital gain', r2(t.net)],
      ['Capital gains tax (estimate)', r2(t.cgt)],
      ['Cash dividends', r2(t.divGross)],
      ['Tax withheld on dividends', r2(t.divWithheld)],
      [],
      ['Sales', 'Symbol', 'Shares', 'Price', 'Average cost', 'Gain', 'Rate %', 'Tax'],
      ...t.sales.map((s) => [s.day, s.symbol, s.shares, r2(s.price), r2(s.avgCost), r2(s.gain), pct(s.rate), r2(s.tax)]),
      [],
      ['Dividends (book closure)', 'Symbol', 'Shares', 'Per share', 'Gross', 'Rate %', 'Withheld', 'Received', 'Shares assumed'],
      ...t.dividends.map((d) => [d.day, d.symbol, d.shares, r2(d.dps), r2(d.gross), pct(d.rate), r2(d.withheld), r2(d.net), d.assumed ? 'yes' : '']),
    ],
  };
  const daily: Sheet = { name: 'Daily value', rows: [['Date', 'Value', 'Cash dividends that day'], ...x.snaps.map((s) => [s.day, r2(s.value), s.div ? r2(s.div) : null])] };
  const about: Sheet = {
    name: 'About',
    rows: [
      ['Made by Sahm', x.made],
      ['Prices', "PSX's latest price when the file was made"],
      ['Trades', 'Only those recorded in Sahm'],
      ['Tax', "An estimate; NCCPL's and your broker's statements are the official record"],
    ],
  };
  return [holdings, trades, dividends, tax, daily, about];
}
