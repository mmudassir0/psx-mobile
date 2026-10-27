/** Each holding's dividend on what you paid, against the yield a buyer gets at today's price. */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtNum } from '../format';
import { dividendTaxRate, payerKind, type TaxStatus } from '../analysis/dividends';
import { yieldOnCost } from '../portfolio/yieldOnCost';
import type { Row } from '../portfolio/useReviews';
import { Panel } from './bits';
import { Section, T } from './kit';

const p1 = (v: number) => `${(v * 100).toFixed(1)}%`;

export function YieldOnCost({ rows, tax }: { rows: Row[]; tax: TaxStatus }) {
  const nav = useNavigation();
  const y = useMemo(
    () =>
      yieldOnCost(
        rows.map((r) => ({
          symbol: r.holding.symbol,
          shares: r.holding.shares,
          avgCost: r.holding.avgCost,
          price: r.price,
          dps: r.dividends?.ttm ?? 0,
          tax: dividendTaxRate(tax, payerKind(r.stock?.sector ?? (r.fund ? 'ETF' : null))),
        })),
      ),
    [rows, tax],
  );
  if (!y.rows.length) return null;
  return (
    <Section title="Yield on what you paid">
      <Panel style={{ paddingVertical: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption">On your cost</T>
            <T style={{ fontFamily: fonts.heavy, fontSize: 22, color: colors.gold }}>{y.onCost != null ? p1(y.onCost) : '–'}</T>
            <T v="caption">{y.onCostNet != null ? `${p1(y.onCostNet)} after tax` : ''}</T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption">At today's prices</T>
            <T style={{ fontFamily: fonts.heavy, fontSize: 22 }}>{y.now != null ? p1(y.now) : '–'}</T>
            <T v="caption">what a buyer gets now</T>
          </View>
        </View>
      </Panel>
      <Panel style={{ paddingVertical: 4 }}>
        <View style={[styles.row, styles.border]}>
          <T v="label" style={{ flex: 1 }}>
            Holding
          </T>
          <T v="label" style={styles.num}>
            On cost
          </T>
          <T v="label" style={styles.num}>
            Now
          </T>
          <T v="label" style={[styles.num, { width: 78 }]}>
            Rs a year
          </T>
        </View>
        {y.rows.map((r, i) => (
          <Pressable key={r.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: r.symbol })} style={[styles.row, i < y.rows.length - 1 && styles.border]}>
            <T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 14 }}>{r.symbol}</T>
            <T v="mono" style={[styles.num, { color: r.onCost > r.now * 1.2 ? colors.up : r.onCost < r.now * 0.8 ? colors.downText : colors.text }]}>
              {p1(r.onCost)}
            </T>
            <T v="mono" style={[styles.num, { color: colors.text2 }]}>
              {p1(r.now)}
            </T>
            <T v="mono" style={[styles.num, { width: 78 }]}>
              {fmtNum(r.income, 0)}
            </T>
          </Pressable>
        ))}
      </Panel>
      <T v="caption" style={{ lineHeight: 17 }}>
        The last 12 months' dividends per share divided by your average price. Green where you're earning well above today's yield because you bought lower; red where you paid more than today's price. Rupees are after
        tax.
      </T>
    </Section>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 6 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    num: { width: 62, textAlign: 'right', fontSize: 13 },
  }),
);
