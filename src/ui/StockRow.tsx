import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Stock } from '../psx/types';
import { colors, fonts } from '../theme';
import { fmtCompact, fmtPrice } from '../format';
import { Badge, Change, T } from './kit';

export function StockRow({
  stock,
  onPress,
  sub,
  last,
}: {
  stock: Stock;
  onPress: () => void;
  /** replaces the company name line, e.g. "Vol 12.4M" */
  sub?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stock.symbol}, ${stock.name}, ${fmtPrice(stock.price)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.avatar}>
        <T style={styles.avatarText}>{stock.symbol.slice(0, 2)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="title" style={{ fontSize: 15 }}>
            {stock.symbol}
          </T>
          {stock.shariah ? <Badge label="SHARIAH" /> : null}
        </View>
        <T v="caption" numberOfLines={1}>
          {sub ?? stock.name}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T v="mono">{fmtPrice(stock.price)}</T>
        <Change pct={stock.changePct} />
      </View>
    </Pressable>
  );
}

export function volumeLabel(s: Stock) {
  return s.volume != null ? `Vol ${fmtCompact(s.volume)}` : s.name;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 4 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.surface2 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontFamily: fonts.heavy, color: colors.muted },
});
