/**
 * Zakat on shares, both common ways it is worked out (e.g. Mufti Taqi Usmani's
 * guidance followed widely in Pakistan):
 *  - shares bought to sell at a profit: 2.5% of their market value on your zakat date;
 *  - shares held for dividends: 2.5% of the company's zakatable assets behind
 *    your shares, approximated here by its current assets (cash, receivables,
 *    stock in trade) per share from the latest balance sheet. Where that isn't
 *    known (banks, missing reports), the market value is used.
 * Nisab, debts and your other wealth aren't included.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { fmtNum } from '../format';
import type { Row } from '../portfolio/useReviews';
import { Panel } from './bits';
import { Segmented, T } from './kit';

const RATE = 0.025;

export function zakatFor(rows: Row[], method: 'trade' | 'income') {
  const lines = rows.map((r) => {
    const per = method === 'income' && r.zakatable && r.zakatable > 0 ? Math.min(r.zakatable, r.price) : r.price;
    return { symbol: r.holding.symbol, base: per * r.holding.shares, zakat: per * r.holding.shares * RATE, approx: method === 'income' && !(r.zakatable && r.zakatable > 0) };
  });
  return { lines, total: lines.reduce((a, l) => a + l.zakat, 0), base: lines.reduce((a, l) => a + l.base, 0) };
}

export function ZakatCard({ rows }: { rows: Row[] }) {
  const [method, setMethod] = useState<'trade' | 'income'>('income');
  const [open, setOpen] = useState(false);
  const z = zakatFor(rows, method);
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <Segmented
        options={[
          { key: 'income', label: 'Held for dividends' },
          { key: 'trade', label: 'Bought to sell' },
        ]}
        value={method}
        onChange={setMethod}
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <T v="body" style={{ fontSize: 14 }}>
          Zakat at today's prices
        </T>
        <T v="mono" style={{ fontSize: 20, fontFamily: fonts.bold }}>
          Rs {fmtNum(z.total, 0)}
        </T>
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        {method === 'trade'
          ? `2.5% of the market value of your shares (Rs ${fmtNum(z.base, 0)}). Shares bought mainly to sell at a profit count like trade goods.`
          : `2.5% of the zakatable assets behind your shares (Rs ${fmtNum(z.base, 0)}): each company's cash, receivables and stock in trade per share, from its latest balance sheet. Buildings and machinery aren't zakatable.`}
      </T>
      {open ? (
        <View style={{ gap: 4 }}>
          {z.lines.map((l) => (
            <View key={l.symbol} style={{ flexDirection: 'row' }}>
              <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                {l.symbol}
                {l.approx ? <T v="caption"> · balance sheet not available, market value used</T> : null}
              </T>
              <T v="mono" style={{ fontSize: 13.5 }}>
                Rs {fmtNum(l.zakat, 0)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }} onPress={() => setOpen((v) => !v)}>
        {open ? 'Hide each holding' : 'Show each holding'}
      </T>
      <T v="caption" style={{ lineHeight: 18 }}>
        Work it out on your own zakat date, with that day's prices. Due only if your total wealth is above nisab, after debts; dividends
        may already have had zakat deducted unless you filed a CZ-50 declaration. Scholars differ on details, so check with one you
        trust.
      </T>
    </Panel>
  );
}
