import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useUser } from '../store/user';
import type { Stock } from '../psx/types';
import { colors, fonts, themed } from '../theme';
import { fmtCompact, fmtPrice } from '../format';
import { Change, T } from './kit';

/** A stable, quiet tint per sector so the list has some rhythm. */
const tints = () => [colors.avatar0, colors.avatar1, colors.avatar2, colors.avatar3, colors.avatar4, colors.avatar5];
function tint(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return tints()[h % tints().length];
}

export function StockRow({
  stock,
  onPress,
  sub,
  last,
  highlight,
}: {
  stock: Stock;
  onPress: () => void;
  /** replaces the company name line, e.g. "Vol 12.4M" */
  sub?: string;
  last?: boolean;
  /** show the sub line in gold: it holds the figure the list is ranked by */
  highlight?: boolean;
}) {
  const { isWatched, toggleWatch } = useUser();
  const watched = isWatched(stock.symbol);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stock.symbol}, ${stock.name}, ${fmtPrice(stock.price)}`}
      accessibilityHint={watched ? 'Long-press to remove from watchlist' : 'Long-press to add to watchlist'}
      onPress={onPress}
      onLongPress={() => {
        Haptics.selectionAsync().catch(() => {});
        toggleWatch(stock.symbol);
      }}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.avatar, { backgroundColor: tint(stock.sector) }]}>
        <T style={styles.avatarText}>{stock.symbol.slice(0, 2)}</T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={styles.symbol}>{stock.symbol}</T>
          {watched ? <T style={styles.star} accessibilityLabel="On your watchlist">★</T> : null}
          {stock.shariah ? <View style={styles.dot} accessibilityLabel="Shariah compliant" /> : null}
        </View>
        <T v="caption" numberOfLines={1} style={highlight && sub ? { color: colors.gold, fontFamily: fonts.semibold } : undefined}>
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

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontFamily: fonts.heavy, color: colors.text2 },
  symbol: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  star: { fontSize: 13, color: colors.gold, marginLeft: -2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.shariah },
}));
