/** This tax year's share gains from sales you recorded, the tax on them, and losing holdings that could offset it. */
import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { fmtNum } from '../format';
import type { Row } from '../portfolio/useReviews';
import { lossOffsets, taxYearOf, taxYearSummary, tradesPref } from '../portfolio/trades';
import { taxStatusPref } from '../portfolio/prefs';
import { cgtRate } from '../portfolio/tax';
import { pkToday } from '../journal/store';
import { Panel } from './bits';
import { T } from './kit';

export function TaxYearCard({ rows }: { rows: Row[] }) {
  const trades = tradesPref.use();
  const status = taxStatusPref.use();
  const year = taxYearOf(pkToday());
  const s = taxYearSummary(trades, year);
  const rate = cgtRate(status).rate;
  const tax = Math.max(0, s.net) * rate;
  const offsets = lossOffsets(
    rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, avgCost: r.holding.avgCost, price: r.price })),
    s.net,
    rate,
  ).slice(0, 4);
  const line = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row' }}>
      <T v="body" style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 14.5, color: color ?? colors.text }}>
        {value}
      </T>
    </View>
  );
  return (
    <Panel style={{ paddingVertical: 14, gap: 8 }}>
      <T v="caption">
        Tax year July {year - 1} – June {year} · from {s.sales} sale{s.sales === 1 ? '' : 's'} recorded in Sahm
      </T>
      {line('Gains on sales', `Rs ${fmtNum(s.gains, 0)}`, colors.up)}
      {line('Losses on sales', `Rs ${fmtNum(s.losses, 0)}`, colors.downText)}
      {line('Net', `Rs ${fmtNum(s.net, 0)}`)}
      {line(`Tax at about ${Math.round(rate * 100)}%`, `Rs ${fmtNum(tax, 0)}`, colors.gold)}
      {s.net > 0 && offsets.some((o) => o.saves > 0) ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 13.5 }}>Holdings at a loss that would offset it</T>
          {offsets
            .filter((o) => o.saves > 0)
            .map((o) => (
              <T key={o.symbol} v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
                {o.symbol}: Rs {fmtNum(o.loss, 0)} down; selling would cut this year's tax by about Rs {fmtNum(o.saves, 0)}
              </T>
            ))}
        </View>
      ) : null}
      <T v="caption" style={{ lineHeight: 18 }}>
        {s.sales === 0
          ? 'Record sales with "Bought or sold" on a holding, and Sahm adds up the year here. '
          : ''}
        A loss on shares sold in the same tax year reduces the tax on your share gains. Selling only for tax still means you no longer
        own the shares, so it's worth it only for holdings you'd sell anyway. NCCPL works out the actual tax through your broker; this
        uses the rate for shares bought from July 2024.
      </T>
    </Panel>
  );
}
