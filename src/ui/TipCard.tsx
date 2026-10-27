/** Home: one tip a day from the lessons; tap to read the lesson, ✕ to hide it until tomorrow. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { makePref } from '../prefs';
import { tipFor } from '../learn/tips';
import { Panel } from './bits';
import { T } from './kit';

export const tipHiddenPref = makePref<string>('ui.tipHidden', '');

export function TipCard() {
  const nav = useNavigation();
  const hidden = tipHiddenPref.use();
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  if (hidden === day) return null;
  const t = tipFor(day);
  return (
    <Panel style={{ paddingVertical: 12, gap: 6, borderLeftWidth: 3, borderLeftColor: colors.gold }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.gold, flex: 1 }}>💡 Tip of the day</T>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide until tomorrow" hitSlop={10} onPress={() => tipHiddenPref.set(day)}>
          <T style={{ fontSize: 13, color: colors.faint }}>✕</T>
        </Pressable>
      </View>
      <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
        {t.text}
      </T>
      <Pressable accessibilityRole="link" onPress={() => nav.navigate('Learn', { lesson: t.lessonIndex })}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>Read the lesson ›</T>
      </Pressable>
    </Panel>
  );
}
