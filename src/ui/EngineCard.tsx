/** Shows whether the on-phone AI engine is reachable and what to do if it isn't. */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import type { EngineState } from '../ai/useEngine';
import { SUGGESTED_MODEL } from '../ai/ollama';
import { Panel } from './bits';
import { Button, T } from './kit';

export function EngineCard({ state, onCheck, compact }: { state: EngineState; onCheck: () => void; compact?: boolean }) {
  const nav = useNavigation();
  if (state.status === 'ready') {
    if (compact) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.up }} />
        <T v="caption">On-phone AI ready · {state.model}</T>
      </View>
    );
  }
  if (state.status === 'checking') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={colors.faint} />
        <T v="caption">Looking for the on-phone AI…</T>
      </View>
    );
  }
  const off = state.status === 'off';
  return (
    <Panel style={{ paddingVertical: 16, gap: 10 }}>
      <T v="body" style={{ fontFamily: fonts.semibold }}>
        {off ? 'On-phone AI is not running' : 'No AI model downloaded yet'}
      </T>
      <T v="caption" style={{ lineHeight: 18 }}>
        {off
          ? 'Sahm uses a free AI model that runs on your phone through Termux and Ollama. Open Termux and run "ollama serve", or follow the one-time setup.'
          : `Ollama is running but has no model. In Termux run: ollama pull ${SUGGESTED_MODEL}`}
      </T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Setup guide" tone="ghost" style={{ flex: 1 }} onPress={() => nav.navigate('AiSetup')} />
        <Button label="Check again" style={{ flex: 1 }} onPress={onCheck} />
      </View>
    </Panel>
  );
}
