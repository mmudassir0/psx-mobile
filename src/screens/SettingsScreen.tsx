import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed, ThemePref } from '../theme';
import { gb, MODELS } from '../ai/models';
import { AiMode, useAi } from '../store/ai';
import { testKey } from '../ai/cloud';
import { GEMINI_MODELS, testGeminiKey } from '../ai/gemini';
import { ModelCard } from '../ui/ModelCard';
import { useTheme } from '../store/theme';
import { BUILD, updatesSupported, useUpdate, VERSION } from '../store/update';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

const MODES: { key: AiMode; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'online', label: 'Online' },
  { key: 'phone', label: 'On phone' },
];
const MODE_NOTE: Record<AiMode, string> = {
  auto: 'Uses the online AI when you are connected and have a key, otherwise the on-phone model.',
  online: 'Always uses the online AI. Needs internet and a Gemini or Groq key.',
  phone: 'Always uses the downloaded model. Works offline; nothing leaves the phone.',
};

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
  const [keyInput, setKeyInput] = useState('');
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [gemInput, setGemInput] = useState('');
  const [gemMsg, setGemMsg] = useState<string | null>(null);
  const [gemTesting, setGemTesting] = useState(false);
  const saveGemini = async () => {
    const k = gemInput.trim();
    if (!k) return;
    setGemTesting(true);
    setGemMsg(null);
    try {
      await testGeminiKey(k);
      await ai.setGeminiKey(k);
      setGemInput('');
      setGemMsg('Key saved and working.');
    } catch (e) {
      setGemMsg((e as Error).message);
    } finally {
      setGemTesting(false);
    }
  };
  const saveKey = async () => {
    const k = keyInput.trim();
    if (!k) return;
    setTesting(true);
    setKeyMsg(null);
    try {
      await testKey(k);
      await ai.setKey(k);
      setKeyInput('');
      setKeyMsg('Key saved and working.');
    } catch (e) {
      setKeyMsg((e as Error).message);
    } finally {
      setTesting(false);
    }
  };
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
          <Segmented options={MODES} value={ai.mode} onChange={ai.setMode} />
          <T v="caption" style={{ lineHeight: 18 }}>
            {MODE_NOTE[ai.mode]}
          </T>

          <View style={styles.card}>
            <T v="body" style={{ fontFamily: fonts.semibold }}>
              Gemini (Google)
            </T>
            <T v="caption" style={{ lineHeight: 18 }}>
              Used first when added. Create a key at aistudio.google.com (Get API key). Flash works on the free tier; Pro and Argon
              need billing on the key's Google Cloud project, which your Developer Program credits can cover.
            </T>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}>
              <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open aistudio.google.com ›</T>
            </Pressable>
            {ai.hasGemini ? (
              <>
                <View style={styles.row}>
                  <T v="body">Key added</T>
                  <Button label="Remove" small tone="ghost" onPress={() => ai.setGeminiKey(null)} />
                </View>
                <Segmented
                  options={GEMINI_MODELS.map((m) => ({ key: m.key, label: m.label.replace('Gemini ', '') }))}
                  value={ai.gemini.key}
                  onChange={ai.setGemini}
                />
                <T v="caption">{ai.gemini.note} If it isn't available, Sahm uses Flash, then Groq.</T>
              </>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={gemInput}
                  onChangeText={setGemInput}
                  placeholder="AIza…"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  style={styles.input}
                />
                <Button label={gemTesting ? 'Checking…' : 'Save key'} disabled={!gemInput.trim() || gemTesting} onPress={saveGemini} />
              </View>
            )}
            {gemMsg ? <T v="caption" style={{ color: gemMsg.startsWith('Key saved') ? colors.up : colors.downText }}>{gemMsg}</T> : null}
          </View>

          <View style={styles.card}>
            <T v="body" style={{ fontFamily: fonts.semibold }}>
              Groq (free)
            </T>
            <T v="caption" style={{ lineHeight: 18 }}>
              GPT-OSS 120B on Groq's free tier, used after Gemini. Sign in at console.groq.com, open API Keys, create a key and paste
              it here. Keys stay encrypted on this phone; questions and stock data are sent to the provider that answers.
            </T>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://console.groq.com/keys')}>
              <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open console.groq.com ›</T>
            </Pressable>
            {ai.hasGroq ? (
              <View style={styles.row}>
                <T v="body">Key added</T>
                <Button label="Remove" small tone="ghost" onPress={() => ai.setKey(null)} />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={keyInput}
                  onChangeText={setKeyInput}
                  placeholder="gsk_…"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  style={styles.input}
                />
                <Button label={testing ? 'Checking…' : 'Save key'} disabled={!keyInput.trim() || testing} onPress={saveKey} />
              </View>
            )}
            {keyMsg ? <T v="caption" style={{ color: keyMsg.startsWith('Key saved') ? colors.up : colors.downText }}>{keyMsg}</T> : null}
          </View>

          <T v="body" style={{ fontFamily: fonts.semibold, marginTop: 6 }}>
            On-phone model
          </T>
          <ModelCard inSettings />
          <View style={styles.card}>
            {MODELS.filter((m) => m.id !== 'qwen2.5-3b' || ai.installed[m.id]).map((m, i, list) => {
              const have = ai.installed[m.id];
              const active = ai.model?.id === m.id && have;
              return (
                <View key={m.id} style={[styles.modelRow, i < list.length - 1 && styles.border]}>
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
            Qwen models from Hugging Face. They run fully on the phone; in On phone mode your questions never leave it.
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
    input: { height: 46, borderRadius: 12, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  }),
);
