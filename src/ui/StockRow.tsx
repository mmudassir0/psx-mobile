import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Stock } from '../psx/types';
import { colors, fonts } from '../theme';
import { fmtCompact, fmtPrice } from '../format';
import { Change, T } from './kit';

/** A stable, quiet tint per sector so the list has some rhythm. */
const TINTS = ['#2A3A52', '#2E3B33', '#3B3326', '#35304A', '#3A2E33', '#263B3D'];
function tint(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

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
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.avatar, { backgroundColor: tint(stock.sector) }]}>
        <T style={styles.avatarText}>{stock.symbol.slice(0, 2)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={styles.symbol}>{stock.symbol}</T>
          {stock.shariah ? <View style={styles.dot} accessibilityLabel="Shariah compliant" /> : null}
        </View>
        <T v="caption" numberOfLines={1}>
          {sub ?? stock.name}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T v="mono" style={{ fontSize: 15.5 }}>
          {fmtPrice(stock.price)}
        </T>
        <Change pct={stock.changePct} pill />
      </View>
    </Pressable>
  );
}

export function volumeLabel(s: Stock) {
  return s.volume != null ? `${fmtCompact(s.volume)} shares traded` : s.name;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontFamily: fonts.heavy, color: colors.text2 },
  symbol: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.shariah },
});
