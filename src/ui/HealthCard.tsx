/** Portfolio health check: what's worth fixing in how your money is spread, and how. */
import React, { useEffect, useState } from 'react';
import { Sparkline } from './PriceChart';
import { healthHistoryPref } from '../portfolio/prefs';
import { addPoint, healthScore, spreadOf, trendLine, weekOf } from '../portfolio/healthScore';
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
  const history = healthHistoryPref.use();
  const score = healthScore(items);
  const { spread, top } = spreadOf(rows.map((r) => r.value));
  // one point a week, saved when you look
  useEffect(() => {
    if (!rows.length || !rows.every((r) => r.price > 0)) return;
    const week = weekOf(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));
    const last = history[history.length - 1];
    if (last && last.week === week && last.score === score && Math.abs(last.spread - spread) < 0.05) return;
    healthHistoryPref.set(addPoint(history, { week, score, spread: Math.round(spread * 10) / 10, top: Math.round(top * 1000) / 1000 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, Math.round(spread * 10), rows.length]);
  if (!rows.length) return null;
  const line = trendLine(history);
  return (
    <Panel style={{ paddingVertical: 4 }}>
      <View style={[styles.row, { alignItems: 'center' }, items.length ? styles.border : null]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Health {score}/100</T>
          <T v="caption" style={{ lineHeight: 17 }}>
            Like owning {spread.toFixed(1)} stocks equally{line ? ` · ${line}` : ''}
          </T>
        </View>
        {history.length >= 2 ? <Sparkline values={history.slice(-26).map((h) => h.score)} width={80} height={28} /> : null}
      </View>
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
