/** Where the money is: a donut of the biggest sectors, and how much is Shariah-compliant. */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, fonts, themed } from '../theme';
import { shortSector } from '../sectors';
import { Card, T } from './kit';

const PALETTE = ['#E8B04B', '#6EA8FE', '#3DC6C0', '#B69CFF', '#F59E72', '#7B8797'];

export function Donut({ parts, size = 120 }: { parts: { pct: number; color: string }[]; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <G rotation={-90} origin="60, 60">
        <Circle cx={60} cy={60} r={r} stroke={colors.surface2} strokeWidth={16} fill="none" />
        {parts.map((p, i) => {
          const len = (p.pct / 100) * c;
          const el = <Circle key={i} cx={60} cy={60} r={r} stroke={p.color} strokeWidth={16} fill="none" strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </G>
    </Svg>
  );
}

export function SectorMix({ items }: { items: { sector: string; value: number; shariah: boolean }[] }) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const sectors = useMemo(() => {
    if (!total) return [];
    const by = new Map<string, number>();
    for (const x of items) by.set(x.sector || 'Other', (by.get(x.sector || 'Other') ?? 0) + x.value);
    const sorted = [...by].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push(['Other', rest]);
    return top.map(([name, v], i) => ({ name: shortSector(name), pct: (v / total) * 100, color: PALETTE[i % PALETTE.length] }));
  }, [items, total]);
  const shariahPct = total ? (items.filter((x) => x.shariah).reduce((a, x) => a + x.value, 0) / total) * 100 : 0;
  if (!total) return null;
  return (
    <View style={{ gap: 18 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Donut parts={sectors} />
        <View style={{ flex: 1, gap: 6 }}>
          {sectors.map((s) => (
            <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
              <T v="caption" style={{ flex: 1, color: s.pct > 35 ? colors.downText : colors.text, fontSize: 12 }} numberOfLines={1}>
                {s.name}
              </T>
              <T v="mono" style={{ fontSize: 12, color: s.pct > 35 ? colors.downText : colors.text }}>
                {s.pct.toFixed(1)}%
              </T>
            </View>
          ))}
        </View>
      </Card>
      <View style={{ gap: 6 }}>
        <View style={styles.between}>
          <T v="body" style={{ fontFamily: fonts.bold }}>
            Shariah-compliant
          </T>
          <T v="mono" style={{ color: colors.shariah }}>
            {shariahPct.toFixed(1)}%
          </T>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.min(100, shariahPct)}%` }]} />
        </View>
        <T v="caption">Based on KMI All-Share index membership on PSX. A sector over 35% is shown in red.</T>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
    barFill: { height: 8, backgroundColor: colors.shariah },
  }),
);
