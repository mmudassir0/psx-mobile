import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed, ThemePref } from '../theme';
import { useEngine } from '../ai/useEngine';
import { DEFAULT_URL } from '../ai/ollama';
import { EngineCard } from '../ui/EngineCard';
import { useTheme } from '../store/theme';
import { BUILD, updatesSupported, useUpdate, VERSION } from '../store/update';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'light', label: 'White' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Phone' },
];

export default function SettingsScreen() {
  const nav = useNavigation();
  const { pref, setPref } = useTheme();
  const upd = useUpdate();
  const engine = useEngine();
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (engine.settings) setUrl(engine.settings.url);
  }, [engine.settings]);
  const active = engine.state.status === 'ready' ? engine.state.model : null;

  const updateLine =
    upd.status === 'checking'
      ? 'Checking…'
      : upd.status === 'current'
        ? 'You have the latest version'
        : upd.status === 'available' || upd.status === 'ready' || upd.status === 'downloading'
          ? `Version ${upd.latest?.version ?? ''} is available`
          : upd.status === 'error'
            ? `Couldn't check: ${upd.error ?? 'unknown error'}`
            : '';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Settings
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Appearance">
          <Segmented options={THEMES} value={pref} onChange={setPref} />
          <T v="caption">“Phone” follows your phone's light or dark mode.</T>
        </Section>

        <Section title="AI">
          <EngineCard state={engine.state} onCheck={engine.check} />
          <View style={styles.card}>
            <T v="label">Ollama address</T>
            <TextInput
              value={url}
              onChangeText={setUrl}
              onEndEditing={() => url.trim() && engine.update({ url: url.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={DEFAULT_URL}
              placeholderTextColor={colors.faint}
              style={styles.input}
            />
            <T v="caption">Leave as {DEFAULT_URL} when Ollama runs in Termux on this phone.</T>
            {engine.models.length ? (
              <View style={{ gap: 6 }}>
                <T v="label">Model</T>
                {engine.models.map((m) => (
                  <Pressable
                    key={m.name}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: m.name === active }}
                    onPress={() => engine.update({ model: m.name })}
                    style={styles.row}
                  >
                    <T v="body" style={{ fontFamily: m.name === active ? fonts.bold : fonts.regular }}>
                      {m.name}
                    </T>
                    <T v="caption">
                      {m.sizeGB.toFixed(1)} GB{m.name === active ? '  ✓' : ''}
                    </T>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Section>

        <Section title="App">
          <View style={styles.card}>
            <View style={styles.row}>
              <T v="body">Version</T>
              <T v="mono" style={{ fontSize: 14, color: colors.text2 }}>
                {VERSION}
                {BUILD ? ` (build ${BUILD})` : ''}
              </T>
            </View>
            {updatesSupported ? (
              <View style={{ gap: 10 }}>
                {updateLine ? <T v="caption">{updateLine}</T> : null}
                <Button label="Check for updates" tone="ghost" onPress={() => upd.check(true)} />
              </View>
            ) : null}
          </View>
        </Section>

        <T v="caption" style={{ lineHeight: 18 }}>
          Prices from the PSX data portal. Market information, not investment advice.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: space.section },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 14 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    input: { height: 44, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontFamily: fonts.regular, fontSize: 14.5, color: colors.text },
  }),
);
