/** Portfolio health check: what's worth fixing in how your money is spread, and how. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { healthCheck, type Level } from '../portfolio/health';
import type { Row } from '../portfolio/useReviews';
import { useMarket } from '../store/market';
import { benchmarkPref } from '../portfolio/prefs';
import { Panel } from './bits';
import { T } from './kit';

const TONE: Record<Level, () => string> = { bad: () => colors.downText, warn: () => colors.gold, ok: () => colors.up };

export function HealthCard({ rows }: { rows: Row[] }) {
  const { stocks } = useMarket();
  const bench = benchmarkPref.use();
  const items = healthCheck(rows, stocks, bench);
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <Panel style={{ paddingVertical: 4 }}>
      {items.map((it, i) => (
        <Pressable key={it.key} accessibilityRole="button" onPress={() => setOpen((k) => (k === it.key ? null : it.key))} style={[styles.row, i < items.length - 1 && styles.border]}>
          <View style={[styles.dot, { backgroundColor: TONE[it.level]() }]} />
          <View style={{ flex: 1, gap: 3 }}>
            <T style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 }}>{it.title}</T>
            {open === it.key ? (
              <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
                {it.fix}
              </T>
            ) : null}
          </View>
          <T style={{ color: colors.faint }}>{open === it.key ? '▴' : '▾'}</T>
        </Pressable>
      ))}
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  }),
);
