/** Settings → Trading costs: your broker's rate and the sales tax where your account is, used for charges and break-even prices. */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { breakEven, costsPref, tradeCost } from '../portfolio/costs';
import { Segmented, T } from './kit';

export function CostsCard() {
  const c = costsPref.use();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (c.brokerage * 100).toFixed(2);
  const ex = tradeCost(1000, 100, c);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="body" style={{ flex: 1 }}>
          Brokerage
        </T>
        <TextInput
          value={shown}
          onChangeText={(t) => {
            setText(t);
            const v = Number(t.replace(/[^\d.]/g, ''));
            if (Number.isFinite(v) && v > 0 && v <= 2.5) costsPref.set({ ...c, brokerage: v / 100 });
          }}
          onBlur={() => setText(null)}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Brokerage percent"
        />
        <T v="body">%</T>
      </View>
      <T v="caption">Sales tax on brokerage, where your broker account is</T>
      <Segmented
        options={[
          { key: '0.16', label: 'Punjab 16%' },
          { key: '0.13', label: 'Sindh 13%' },
        ]}
        value={c.salesTax === 0.13 ? '0.13' : '0.16'}
        onChange={(k) => costsPref.set({ ...c, salesTax: Number(k) })}
      />
      <T v="caption" style={{ lineHeight: 18 }}>
        A Rs 100,000 trade costs about Rs {ex.total.toFixed(0)} ({(ex.pct * 100).toFixed(2)}%) each way, so a share bought at Rs 100 has to
        reach Rs {breakEven(1000, 100, c).toFixed(2)} to break even. PSX's minimum is 0.15%; your broker's rate is in its schedule of charges.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10 },
    input: { width: 80, height: 40, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontSize: 15, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
  }),
);
