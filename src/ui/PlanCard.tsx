/** "Where should this month's money go?": enter an amount, see how Sahm would split it across your holdings. */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtNum, fmtPrice } from '../format';
import { load, save } from '../storage';
import { planMoney } from '../portfolio/plan';
import type { Row } from '../portfolio/useReviews';
import { Panel } from './bits';
import { T } from './kit';

const KEY = 'plan.amount';

export function PlanCard({ rows, breadth }: { rows: Row[]; breadth: number | null }) {
  const [text, setText] = useState('');
  useEffect(() => {
    load<string>(KEY, '').then((v) => v && setText(v));
  }, []);
  const amount = Number(text.replace(/[^\d.]/g, '')) || 0;
  const plan = useMemo(
    () =>
      amount > 0
        ? planMoney(
            rows.map((r) => ({ symbol: r.holding.symbol, price: r.price, value: r.value, sector: r.stock?.sector ?? 'Other', review: r.review, fund: r.fund })),
            amount,
            { breadth },
          )
        : null,
    [rows, amount, breadth],
  );
  return (
    <Panel style={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          Money to invest (Rs)
        </T>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            save(KEY, t);
          }}
          placeholder="50,000"
          keyboardType="numeric"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Money to invest in rupees"
        />
      </View>
      {!plan ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          Enter what you're adding this month. Sahm splits it across holdings you already own, skipping any marked Review or Trim, any with a
          broken chart, and any that would go over 10% of your portfolio.
        </T>
      ) : (
        <>
          {plan.note ? (
            <View style={styles.note}>
              <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                {plan.note}
              </T>
            </View>
          ) : null}
          {plan.lines.map((l, i) => (
            <View key={l.symbol} style={[styles.line, i < plan.lines.length - 1 && styles.border]}>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <T style={{ fontFamily: fonts.heavy, fontSize: 15 }}>
                  Buy {fmtNum(l.shares, 0)} {l.symbol}
                </T>
                <T v="caption" style={{ lineHeight: 17 }}>
                  {l.why.charAt(0).toUpperCase() + l.why.slice(1)}. {(l.weightAfter * 100).toFixed(1)}% of the portfolio after.
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T v="mono" style={{ fontSize: 14.5 }}>
                  Rs {fmtNum(l.amount, 0)}
                </T>
                <T v="caption">at {fmtPrice(l.price)}</T>
              </View>
            </View>
          ))}
          {plan.lines.length ? (
            <T v="caption">
              Total Rs {fmtNum(amount - plan.left, 0)}
              {plan.left >= 1 ? `; Rs ${fmtNum(plan.left, 0)} left over` : ''}. Prices are the last trade; fees and tax are extra.
            </T>
          ) : null}
          {plan.dilute.map((d) => (
            <T key={d.symbol} v="caption" style={{ lineHeight: 18 }}>
              {d.symbol} is {(d.weight * 100).toFixed(0)}% of your portfolio. Adding about Rs {fmtNum(Math.ceil(d.needed / 1000) * 1000, 0)} to other holdings brings it
              under 20% without selling it, so no tax or fees.
            </T>
          ))}
          {plan.skipped.length ? (
            <T v="caption" style={{ lineHeight: 18 }}>
              Left out: {plan.skipped.map((s) => `${s.symbol}, ${s.why}`).join("; ")}.
            </T>
          ) : null}
        </>
      )}
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    input: { width: 130, height: 44, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontFamily: fonts.mono, fontSize: 15, color: colors.text, textAlign: 'right' },
    line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    note: { backgroundColor: colors.goldSoft, borderRadius: 8, padding: 10 },
  }),
);
