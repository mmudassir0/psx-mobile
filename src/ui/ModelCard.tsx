/** Shown where the AI would answer but no key is saved yet: how to turn it on. */
import React from 'react';
import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { useAi } from '../store/ai';
import { Panel } from './bits';
import { T } from './kit';

export function ModelCard() {
  const ai = useAi();
  const nav = useNavigation();
  if (ai.available) return null;
  return (
    <Panel style={{ paddingVertical: 16, gap: 10 }}>
      <T v="body" style={{ fontFamily: fonts.semibold }}>
        Set up the AI
      </T>
      <T v="caption" style={{ lineHeight: 18 }}>
        Add a free Groq key in Settings → AI. It answers with GPT-OSS 120B, online.
      </T>
      <Pressable accessibilityRole="button" onPress={() => nav.navigate('Settings')}>
        <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open Settings ›</T>
      </Pressable>
    </Panel>
  );
}
