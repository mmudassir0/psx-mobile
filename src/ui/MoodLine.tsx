/** One line of market mood and the KSE-100; tap for the market. */
import React from 'react';
import { useFlag } from '../flags';
import { Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { moodLabel } from '../analysis/mood';
import { fmtNum, fmtPct } from '../format';
import { useMarket } from '../store/market';
import { moodColor, useMood } from './MoodCard';
import { T } from './kit';

export function MoodLine() {
  const nav = useNavigation();
  const moodOn = useFlag('mood');
  const { data: moodData } = useMood();
  const mood = moodOn ? moodData : null;
  const { indices } = useMarket();
  const kse = indices.find((i) => i.code === 'KSE100');
  if (!mood && !kse) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => nav.navigate('Tabs', { screen: 'Market' })} style={({ pressed }) => [styles.line, pressed && { opacity: 0.7 }]}>
      <T style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>
        {kse ? (
          <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>
            KSE-100 {fmtNum(kse.current)} <T style={{ fontSize: 14, color: (kse.changePct ?? 0) >= 0 ? colors.up : colors.downText }}>{fmtPct(kse.changePct)}</T>
          </T>
        ) : null}
        {mood ? (
          <T style={{ fontSize: 14, color: moodColor(mood.now.score) }}>
            {kse ? ' · ' : ''}mood {mood.now.score} {moodLabel(mood.now.score).toLowerCase()}
          </T>
        ) : null}
      </T>
      <T style={{ color: colors.faint }}>›</T>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 14, paddingVertical: 12 },
  }),
);
