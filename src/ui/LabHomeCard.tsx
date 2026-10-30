/** Home: the lab strategy you follow, this month and since you started following, against your portfolio and the index. */
import React, { useEffect, useState } from 'react';
import { runCached } from '../lab/cache';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, themed } from '../theme';
import { findStrategy, labFollowPref, labStrategiesPref, loadLab } from '../lab/store';
import { snapshots, trackReturns } from '../portfolio/track';
import { T } from './kit';
import { ToolIcon } from './ToolIcon';

const pc = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`);

interface Figures {
  name: string;
  id: string;
  month: { strat: number; bench: number; mine: number | null };
  since: { from: string; strat: number; bench: number; mine: number | null };
  day: string;
}

/** growth over [from, last] of a series that starts at `start` in the lab's days */
const over = (days: string[], start: number, g: Float64Array, from: string) => {
  const k = days.findIndex((d, i) => i >= start && d >= from);
  return k < 0 ? 0 : g[g.length - 1] / g[k - start] - 1;
};

export function LabHomeCard({ padStyle }: { padStyle?: StyleProp<ViewStyle> }) {
  const nav = useNavigation();
  const follow = labFollowPref.use();
  const mine = labStrategiesPref.use();
  const [f, setF] = useState<Figures | null>(null);
  useEffect(() => {
    if (!follow) return setF(null);
    let alive = true;
    const t = setTimeout(async () => {
      const st = findStrategy(follow.id, mine);
      const lab = st ? await loadLab().catch(() => null) : null;
      if (!lab || !st || !alive) return;
      const r = runCached(lab, st);
      const last = lab.days[lab.days.length - 1];
      const monthStart = `${last.slice(0, 7)}-01`;
      const snaps = trackReturns((await snapshots()).filter((x) => x.value > 0));
      const mineOver = (from: string) => {
        const a = snaps.find((p) => p.day >= from);
        const b = [...snaps].reverse().find((p) => p.day <= last);
        return a && b && b.day > a.day ? (1 + b.ret) / (1 + a.ret) - 1 : null;
      };
      if (!alive) return;
      setF({
        name: st.name,
        id: st.id,
        day: last,
        month: { strat: over(lab.days, r.start, r.growth, monthStart), bench: over(lab.days, r.start, r.benchGrowth, monthStart), mine: mineOver(monthStart) },
        since: { from: follow.since, strat: over(lab.days, r.start, r.growth, follow.since), bench: over(lab.days, r.start, r.benchGrowth, follow.since), mine: mineOver(follow.since) },
      });
    }, 3000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [follow, mine]);
  if (!follow || !f) return null;
  const cell = (k: string, v: number | null, strong?: boolean) => (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption" style={{ fontSize: 11 }}>
        {k}
      </T>
      <T v="mono" style={{ fontFamily: strong ? fonts.bold : fonts.mono, fontSize: 14, color: v == null ? colors.faint : changeColor(v) }}>
        {pc(v)}
      </T>
    </View>
  );
  return (
    <View style={padStyle}>
      <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabResult', { id: f.id })} style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ToolIcon name="flask" size={18} color={colors.gold} />
          <T style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1 }} numberOfLines={1}>
            {f.name}
          </T>
          <T v="caption">›</T>
        </View>
        <T v="caption">This month, to {f.day}</T>
        <View style={{ flexDirection: 'row' }}>
          {cell('Strategy', f.month.strat, true)}
          {cell('Your portfolio', f.month.mine)}
          {cell('Index', f.month.bench)}
        </View>
        <T v="caption">Since you started following ({f.since.from})</T>
        <View style={{ flexDirection: 'row' }}>
          {cell('Strategy', f.since.strat, true)}
          {cell('Your portfolio', f.since.mine)}
          {cell('Index', f.since.bench)}
        </View>
      </Pressable>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.hairline },
  }),
);
