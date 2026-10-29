/** Every tool in the app as tiles, grouped, so nothing is ever hard to find. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { GROUPS, visibleFeatures } from '../nav/features';
import { useFlags } from '../flags';
import { T } from './kit';
import { ToolIcon, toolGlyph } from './ToolIcon';

/** `short`: only the first group until "Show all tools" is tapped (Home, where the full grid is several screens long) */
export function ToolsGrid({ title = 'All tools', short = false }: { title?: string; short?: boolean }) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const features = visibleFeatures(useFlags());
  const [all, setAll] = useState(!short);
  // three tiles a row at any width (a percentage plus fixed gaps wrapped to two on narrow phones)
  const [w, setW] = useState(0);
  const tileW = w ? Math.floor((w - 2 * GAP) / 3) : undefined;
  const groups = GROUPS.filter((g) => features.some((f) => f.group === g && f.key !== 'home'));
  const total = features.filter((f) => f.key !== 'home').length;
  return (
    <View style={{ gap: 14 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <T style={{ fontFamily: fonts.heavy, fontSize: 19 }}>{title}</T>
      {(all ? groups : groups.slice(0, 1)).map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <T v="caption" style={{ fontFamily: fonts.bold }}>
            {g}
          </T>
          <View style={styles.grid}>
            {features
              .filter((f) => f.group === g && f.key !== 'home')
              .map((f) => (
                <Pressable
                  key={f.key}
                  accessibilityRole="button"
                  accessibilityLabel={f.label}
                  onPress={() => f.go(nav)}
                  style={({ pressed }) => [styles.tile, tileW ? { width: tileW } : null, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.glyph}>
                  <ToolIcon name={toolGlyph(f.key, f.group)} size={21} />
                </View>
                  <T style={{ fontFamily: fonts.semibold, fontSize: tileW && tileW < 100 ? 11.5 : 12.5, textAlign: 'center' }} numberOfLines={2}>
                    {f.label}
                  </T>
                </Pressable>
              ))}
          </View>
        </View>
      ))}
      {short ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((x) => !x)} hitSlop={6} style={styles.more}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{all ? 'Show fewer tools' : `Show all ${total} tools`}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const GAP = 8;

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    glyph: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    more: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
    tile: {
      width: '31.5%',
      minHeight: 82,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 3,
    },
  }),
);
