/** Small building blocks for data-dense screens: range bars, key-value rows, Buy/Sell chips, a tab strip. */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, fonts, tabular, themed } from '../theme';
import { fmtPrice } from '../format';
import { T } from './kit';

/** Where `value` sits between `low` and `high`, with both ends labelled. */
export function RangeBar({
  lowLabel,
  highLabel,
  low,
  high,
  value,
  format = fmtPrice,
}: {
  lowLabel: string;
  highLabel: string;
  low: number | null;
  high: number | null;
  value: number | null;
  format?: (v: number | null) => string;
}) {
  const ok = low != null && high != null && value != null && high > low;
  const pos = ok ? Math.min(1, Math.max(0, ((value as number) - (low as number)) / ((high as number) - (low as number)))) : null;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rangeHead}>
        <View>
          <T v="caption">{lowLabel}</T>
          <T v="mono" style={{ fontSize: 15 }}>
            {format(low)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="caption">{highLabel}</T>
          <T v="mono" style={{ fontSize: 15 }}>
            {format(high)}
          </T>
        </View>
      </View>
      <View style={styles.track} accessibilityLabel={pos != null ? `${Math.round(pos * 100)}% of the way from low to high` : undefined}>
        {pos != null ? (
          <>
            <View style={[styles.fill, { width: `${pos * 100}%` }]} />
            <View style={[styles.knob, { left: `${pos * 100}%` }]} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** One label / value line in a list of figures. */
export function KV({
  label,
  value,
  sub,
  color,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.kv, !last && styles.kvBorder]}>
      <View style={{ flex: 1, gap: 1 }}>
        <T v="body" style={{ fontSize: 14.5, color: colors.text2 }}>
          {label}
        </T>
        {sub ? <T v="caption">{sub}</T> : null}
      </View>
      <T v="mono" style={{ fontSize: 15, color: color ?? colors.text, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

export type Action = 'Buy' | 'Sell' | 'Neutral' | 'Strong buy' | 'Strong sell';

export function actionColors(a: Action): [string, string] {
  if (a === 'Buy' || a === 'Strong buy') return [colors.up, colors.upSoft];
  if (a === 'Sell' || a === 'Strong sell') return [colors.downText, colors.downSoft];
  return [colors.muted, colors.surface2];
}

export function ActionChip({ action, wide }: { action: Action; wide?: boolean }) {
  const [fg, bg] = actionColors(action);
  return (
    <View style={[styles.chip, { backgroundColor: bg }, wide && { minWidth: 76 }]}>
      <T style={{ fontFamily: fonts.bold, fontSize: 12, color: fg, letterSpacing: 0.3 }}>{action.toUpperCase()}</T>
    </View>
  );
}

/** Horizontally scrolling tab strip with an underline on the active tab. */
export function TabStrip<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  // Up to five tabs share the width evenly; more scroll sideways.
  const fit = tabs.length <= 5;
  const items = tabs.map((t) => {
    const on = t.key === value;
    return (
      <Pressable
        key={t.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(t.key)}
        style={[styles.tab, fit && { flex: 1, paddingHorizontal: 4 }]}
      >
        <T style={{ fontFamily: on ? fonts.bold : fonts.semibold, fontSize: 14, color: on ? colors.text : colors.faint }} numberOfLines={1}>
          {t.label}
        </T>
        <View style={[styles.underline, on && { backgroundColor: colors.gold }]} />
      </Pressable>
    );
  });
  if (fit) return <View style={[styles.strip, { flexDirection: 'row', paddingHorizontal: 8 }]}>{items}</View>;
  return (
    <View style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(t.key)}
              style={styles.tab}
            >
              <T style={{ fontFamily: on ? fonts.bold : fonts.semibold, fontSize: 14, color: on ? colors.text : colors.faint }}>{t.label}</T>
              <View style={[styles.underline, on && { backgroundColor: colors.gold }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A rounded panel that groups related rows. */
export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export const mono = { fontFamily: fonts.monoMedium, ...tabular };

const styles = themed(() =>
  StyleSheet.create({
    rangeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginTop: 2 },
    fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: colors.goldSoft },
    knob: {
      position: 'absolute',
      top: -5,
      width: 16,
      height: 16,
      marginLeft: -8,
      borderRadius: 8,
      backgroundColor: colors.gold,
      borderWidth: 3,
      borderColor: colors.ground,
    },
    kv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    kvBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    chip: { paddingHorizontal: 10, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    strip: { backgroundColor: colors.ground, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    tab: { paddingHorizontal: 10, paddingTop: 12, alignItems: 'center' },
    underline: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginTop: 10, backgroundColor: 'transparent' },
    panel: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: colors.hairline },
  }),
);
