/** Every tool in the app as tiles, grouped, so nothing is ever hard to find. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { GROUPS, visibleFeatures } from '../nav/features';
import { useFlags } from '../flags';
import { T } from './kit';

export function ToolsGrid({ title = 'All tools' }: { title?: string }) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const features = visibleFeatures(useFlags());
  return (
    <View style={{ gap: 14 }}>
      <T style={{ fontFamily: fonts.heavy, fontSize: 19 }}>{title}</T>
      {GROUPS.filter((g) => features.some((f) => f.group === g && f.key !== 'home')).map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <T v="caption" style={{ fontFamily: fonts.bold }}>
            {g}
          </T>
          <View style={styles.grid}>
            {features.filter((f) => f.group === g && f.key !== 'home').map((f) => (
              <Pressable key={f.key} accessibilityRole="button" accessibilityLabel={f.label} onPress={() => f.go(nav)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
                <T style={{ fontSize: 22 }}>{f.emoji}</T>
                <T style={{ fontFamily: fonts.semibold, fontSize: 12.5, textAlign: 'center' }} numberOfLines={2}>
                  {f.label}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { width: '31.5%', minHeight: 82, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  }),
);
