/** Your own lines on the chart: a level at a price, or a trend line under the recent lows or over the recent highs. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { chartLinesPref } from '../portfolio/prefs';
import { autoTrend, NO_LINES, trendNow, type UserLines } from '../analysis/chartLines';
import type { Candle } from '../psx/types';
import { T } from './kit';

export function MyLines({ symbol, daily }: { symbol: string; daily: Candle[] | null }) {
  const all = chartLinesPref.use();
  const mine: UserLines = all[symbol] ?? NO_LINES;
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = (l: UserLines) => chartLinesPref.set({ ...all, [symbol]: l });
  const last = daily?.[daily.length - 1]?.c ?? null;

  const addTrend = (kind: 'lows' | 'highs') => {
    const t = daily ? autoTrend(daily, kind) : null;
    if (!t) return setMsg(`No two clear ${kind === 'lows' ? 'lows' : 'highs'} in the last year to draw through.`);
    setMsg(null);
    save({ ...mine, trends: [...mine.trends.filter((x) => x.kind !== kind), t] });
  };

  return (
    <View style={styles.box}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={last ? `Level, e.g. ${last.toFixed(0)}` : 'Price'} placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Price for a level" />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const v = Number(price.replace(/,/g, ''));
            if (!(v > 0)) return;
            save({ ...mine, levels: [...mine.levels.filter((l) => Math.abs(l.price - v) > 1e-6), { price: v }].slice(-4) });
            setPrice('');
          }}
          style={styles.btn}
        >
          <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.onGold }}>Add level</T>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => addTrend('lows')} style={styles.chip}>
          <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.up }}>↗ Line under the lows</T>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => addTrend('highs')} style={styles.chip}>
          <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.downText }}>↘ Line over the highs</T>
        </Pressable>
      </View>
      {msg ? <T v="caption">{msg}</T> : null}
      {mine.levels.map((l) => (
        <View key={`l${l.price}`} style={styles.row}>
          <T v="caption" style={{ flex: 1 }}>
            Level Rs {l.price.toFixed(2)}
            {last ? ` · price ${last >= l.price ? 'above' : 'below'} by ${Math.abs((last / l.price - 1) * 100).toFixed(1)}%` : ''}
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove level" hitSlop={8} onPress={() => save({ ...mine, levels: mine.levels.filter((x) => x !== l) })}>
            <T style={{ color: colors.faint }}>✕</T>
          </Pressable>
        </View>
      ))}
      {mine.trends.map((t) => {
        const now = daily ? trendNow(daily, t) : null;
        return (
          <View key={`t${t.kind}`} style={styles.row}>
            <T v="caption" style={{ flex: 1 }}>
              {t.kind === 'lows' ? 'Under the lows' : 'Over the highs'} ({fmtDay(t.t1)} → {fmtDay(t.t2)})
              {now ? `: Rs ${now.value.toFixed(2)} today, price ${now.gap >= 0 ? 'above' : 'below'} by ${Math.abs(now.gap * 100).toFixed(1)}%` : ''}
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove line" hitSlop={8} onPress={() => save({ ...mine, trends: mine.trends.filter((x) => x !== t) })}>
              <T style={{ color: colors.faint }}>✕</T>
            </Pressable>
          </View>
        );
      })}
      <T v="caption" style={{ lineHeight: 17 }}>
        A close below a rising line under the lows, or above a falling line over the highs, is often read as the trend changing. Lines are a way of looking,
        not a forecast. They show on the daily ranges.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 8, marginHorizontal: 16 },
    input: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium, fontSize: 14, paddingHorizontal: 10, paddingVertical: 0 },
    btn: { paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: colors.gold, justifyContent: 'center' },
    chip: { paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: colors.surface2, justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  }),
);
