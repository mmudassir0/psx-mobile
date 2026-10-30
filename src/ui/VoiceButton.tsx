/** Hold to speak a question; on release it's turned into text and handed back. */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { colors, themed } from '../theme';
import { aiKeys } from '../store/ai';
import { transcribe } from '../ai/voice';
import { logProblem } from '../log';
import { T } from './kit';
import { ToolIcon } from './ToolIcon';

export function VoiceButton({ symbols, onText, onStatus, disabled }: { symbols: string[]; onText: (t: string) => void; onStatus: (s: string | null) => void; disabled?: boolean }) {
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const started = useRef(0);

  const start = async () => {
    if (state !== 'idle' || disabled) return;
    try {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (!p.granted) return onStatus('Sahm needs the microphone to hear your question. Allow it in the phone settings.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync();
      rec.record();
      started.current = Date.now();
      setState('rec');
      onStatus('Listening… let go when you’re done');
    } catch (e) {
      logProblem('voice', e);
      onStatus(`Couldn't start recording: ${(e as Error).message}`);
      setState('idle');
    }
  };

  const stop = async () => {
    if (state !== 'rec') return;
    setState('busy');
    try {
      await rec.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (Date.now() - started.current < 700) {
        onStatus('Hold the mic while you speak.');
        return setState('idle');
      }
      const { groq } = await aiKeys();
      if (!groq) {
        onStatus('Spoken questions use your Groq key: add it in Settings → AI.');
        return setState('idle');
      }
      onStatus('Turning it into text…');
      const text = await transcribe(rec.uri ?? '', groq, { symbols });
      onStatus(null);
      if (text) onText(text);
      else onStatus("Didn't catch that. Try again a little closer to the phone.");
    } catch (e) {
      logProblem('voice', e);
      onStatus((e as Error).message);
    } finally {
      setState('idle');
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to ask by voice"
      disabled={disabled || state === 'busy'}
      onPressIn={start}
      onPressOut={stop}
      style={[styles.mic, state === 'rec' && { backgroundColor: colors.down }, (disabled || state === 'busy') && { opacity: 0.5 }]}
    >
      <View style={styles.dot}>
        {state === 'busy' ? <T style={{ fontSize: 18 }}>…</T> : <ToolIcon name="mic" size={20} color={state === 'rec' ? '#fff' : colors.text} />}
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    mic: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
    dot: { alignItems: 'center', justifyContent: 'center' },
  }),
);
