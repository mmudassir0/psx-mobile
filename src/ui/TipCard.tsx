/** Home: one tip a day from the lessons; tap to read the lesson, ✕ to hide it until tomorrow. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { makePref } from '../prefs';
import { tipFor } from '../learn/tips';
import { Panel } from './bits';
import { T } from './kit';
import { ToolIcon } from './ToolIcon';

export const tipHiddenPref = makePref<string>('ui.tipHidden', '');

export function TipCard() {
  const nav = useNavigation();
  const hidden = tipHiddenPref.use();
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  if (hidden === day) return null;
  const t = tipFor(day);
  return (
    <Panel style={{ paddingVertical: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
          <ToolIcon name="bulb" size={17} color={colors.gold} />
        </View>
        <T style={{ fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted, flex: 1 }}>Tip of the day</T>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide until tomorrow" hitSlop={12} onPress={() => tipHiddenPref.set(day)}>
          <ToolIcon name="close" size={16} color={colors.faint} />
        </Pressable>
      </View>
      <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>
        {t.text}
      </T>
      <Pressable accessibilityRole="link" onPress={() => nav.navigate('Learn', { lesson: t.lessonIndex })} hitSlop={6}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Read the lesson ›</T>
      </Pressable>
    </Panel>
  );
}
