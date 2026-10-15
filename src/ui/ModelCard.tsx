/** Choose, download and manage the on-phone AI model; shows its status once installed. */
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { gb, MODELS } from '../ai/models';
import { useAi } from '../store/ai';
import { Panel } from './bits';
import { Button, T } from './kit';

function Bar({ value }: { value: number }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: 8, backgroundColor: colors.gold }} />
    </View>
  );
}

export function ModelCard({ inSettings }: { inSettings?: boolean } = {}) {
  const ai = useAi();
  const nav = useNavigation();
  const m = ai.model;

  if (ai.phase === 'checking') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={colors.faint} />
        <T v="caption">Checking the AI model…</T>
      </View>
    );
  }

  if (ai.phase === 'installed' || ai.phase === 'ready') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.up }} />
        <T v="caption">
          On-phone AI ready · {m?.name}
          {ai.simulated ? ' (web preview)' : ''}
        </T>
      </View>
    );
  }

  if (ai.phase === 'loading') {
    return (
      <View style={{ gap: 6 }}>
        <T v="caption">Loading {m?.name} into memory… {Math.round(ai.progress * 100)}%</T>
        <Bar value={ai.progress} />
      </View>
    );
  }

  if ((ai.phase === 'downloading' || ai.phase === 'paused') && m) {
    const paused = ai.phase === 'paused';
    return (
      <Panel style={{ paddingVertical: 16, gap: 10 }}>
        <T v="body" style={{ fontFamily: fonts.semibold }}>
          {paused ? 'Download paused' : 'Downloading AI model'}
        </T>
        <T v="caption">
          {m.name} · {gb(ai.progress * m.bytes)} of {gb(m.bytes)} ({Math.round(ai.progress * 100)}%)
        </T>
        <Bar value={ai.progress} />
        {!paused ? <T v="caption">Keep Sahm open, on Wi-Fi if you can. You can pause and resume later.</T> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={ai.cancel} />
          {paused ? (
            <Button label="Resume" style={{ flex: 1 }} onPress={() => ai.startDownload(m.id)} />
          ) : (
            <Button label="Pause" style={{ flex: 1 }} onPress={ai.pause} />
          )}
        </View>
      </Panel>
    );
  }

  // none or error: pick a model
  return (
    <Panel style={{ paddingVertical: 16, gap: 12 }}>
      <T v="body" style={{ fontFamily: fonts.semibold }}>
        Set up the AI
      </T>
      <T v="caption" style={{ lineHeight: 18 }}>
        Download a model to run the AI on your phone (free, private, works offline), or add a free online key for the smartest
        answers.
      </T>
      {!ai.hasKey && !inSettings ? (
        <Pressable accessibilityRole="button" onPress={() => nav.navigate('Settings')}>
          <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Use the free online AI instead ›</T>
        </Pressable>
      ) : null}
      {ai.error ? <T v="caption" style={{ color: colors.downText }}>{ai.error}</T> : null}
      {MODELS.filter((x) => x.id !== 'qwen2.5-3b').map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
              {x.name}
            </T>
            <T v="caption">
              {gb(x.bytes)} · {x.blurb}
            </T>
          </View>
          <Button label="Download" small onPress={() => ai.startDownload(x.id)} />
        </View>
      ))}
    </Panel>
  );
}
