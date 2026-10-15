/** Choose, download and manage the on-phone AI model; shows its status once installed. */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
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

export function ModelCard() {
  const ai = useAi();
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
        Download the AI model
      </T>
      <T v="caption" style={{ lineHeight: 18 }}>
        Sahm's AI runs entirely on your phone: free, private, works offline. Download it once; Wi-Fi recommended.
      </T>
      {ai.error ? <T v="caption" style={{ color: colors.downText }}>{ai.error}</T> : null}
      {MODELS.map((x) => (
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
