import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed, ThemePref } from '../theme';
import { gb, MODELS } from '../ai/models';
import { useAi } from '../store/ai';
import { ModelCard } from '../ui/ModelCard';
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
  const ai = useAi();
  const busy = ai.phase === 'downloading' || ai.phase === 'paused' || ai.phase === 'loading';
  const confirmRemove = (id: string, name: string) =>
    Alert.alert('Delete model?', `${name} will be removed from your phone. You can download it again later.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => ai.remove(id) },
    ]);

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
          <ModelCard />
          <View style={styles.card}>
            {MODELS.map((m, i) => {
              const have = ai.installed[m.id];
              const active = ai.model?.id === m.id && have;
              return (
                <View key={m.id} style={[styles.modelRow, i < MODELS.length - 1 && styles.border]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="body" style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 14.5 }}>
                      {m.name}
                      {active ? '  ✓' : ''}
                    </T>
                    <T v="caption">
                      {gb(m.bytes)} · {have ? (active ? 'In use' : 'Downloaded') : 'Not downloaded'}
                    </T>
                  </View>
                  {have && !active ? <Button label="Use" small tone="ghost" disabled={busy} onPress={() => ai.select(m.id)} /> : null}
                  {have ? <Button label="Delete" small tone="ghost" disabled={busy} onPress={() => confirmRemove(m.id, m.name)} /> : null}
                  {!have ? <Button label="Download" small disabled={busy} onPress={() => ai.startDownload(m.id)} /> : null}
                </View>
              );
            })}
          </View>
          <T v="caption" style={{ lineHeight: 18 }}>
            Models come from Qwen's official releases on Hugging Face and run fully on the phone; your questions never leave it.
          </T>
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
    modelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
