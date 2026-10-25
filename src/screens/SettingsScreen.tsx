import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed, ThemePref } from '../theme';
import { useAi } from '../store/ai';
import { testKey } from '../ai/cloud';
import { GEMINI_MODELS, testGeminiKey } from '../ai/gemini';
import { useTheme } from '../store/theme';
import { BUILD, updatesSupported, useUpdate, VERSION } from '../store/update';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';
import { LAYOUTS, layoutPref } from '../nav/layout';
import { FLAGS, flagsPref, isOn, type Flag } from '../flags';
import { Panel } from '../ui/bits';
import { UpdatesCard } from '../ui/UpdatesCard';
import { BackupCard } from '../ui/BackupCard';
import { taxStatusPref } from '../portfolio/prefs';
import type { TaxStatus } from '../analysis/dividends';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'light', label: 'White' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Phone' },
];

export default function SettingsScreen() {
  const nav = useNavigation();
  const layout = layoutPref.use();
  const flags = flagsPref.use();
  const flagOn = (k: Flag) => isOn(flags, k);
  const taxStatus = taxStatusPref.use();
  const { pref, setPref } = useTheme();
  const upd = useUpdate();
  const ai = useAi();
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
      const r = await testGeminiKey(k);
      await ai.setGeminiKey(k);
      setGemInput('');
      setGemMsg(r === 'ok' ? 'Key saved and working.' : 'Key saved. Gemini is busy right now, so Sahm will use Groq until it frees up.');
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
        <Section title="Layout">
          <Panel style={{ paddingVertical: 4 }}>
            {LAYOUTS.map((l, i) => (
              <Pressable
                key={l.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: layout === l.key }}
                onPress={() => layoutPref.set(l.key)}
                style={[styles.layoutRow, i < LAYOUTS.length - 1 && styles.layoutBorder]}
              >
                <View style={[styles.radio, layout === l.key && styles.radioOn]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{l.label}</T>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    {l.desc}
                  </T>
                </View>
              </Pressable>
            ))}
          </Panel>
          <T v="caption">Every screen is in every layout; only the way you reach them changes. Try each for a day.</T>
        </Section>

        <Section title="Features">
          <Panel style={{ paddingVertical: 4 }}>
            {FLAGS.map((f, i) => (
              <View key={f.key} style={[styles.layoutRow, i < FLAGS.length - 1 && styles.layoutBorder]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14.5 }}>{f.label}</T>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    {f.desc}
                  </T>
                </View>
                <Switch
                  value={flagOn(f.key)}
                  onValueChange={(v) => flagsPref.set({ ...flags, [f.key]: v })}
                  trackColor={{ true: colors.gold, false: colors.line }}
                  thumbColor={colors.surface}
                  accessibilityLabel={f.label}
                />
              </View>
            ))}
          </Panel>
          <T v="caption">Switched off means hidden everywhere. Nothing you saved is deleted; switch it back on and it returns.</T>
        </Section>

        <Section title="Updates">
          <UpdatesCard />
        </Section>

        <Section title="Appearance">
          <Segmented options={THEMES} value={pref} onChange={setPref} />
          <T v="caption">“Phone” follows your phone's light or dark mode.</T>
        </Section>

        <Section title="Tax status">
          <Segmented
            options={[
              { key: 'filer', label: 'Filer' },
              { key: 'non-filer', label: 'Non-filer' },
            ]}
            value={taxStatus}
            onChange={(v: TaxStatus) => taxStatusPref.set(v)}
          />
          <T v="caption" style={{ lineHeight: 18 }}>
            Used for dividends and selling tax. On the FBR Active Taxpayers List (a filer): 15% on dividends, 7.5% from power producers. Not on
            it: 30% and 15%. Rates for 2026-27; your broker's statement shows what was actually withheld.
          </T>
        </Section>

        {flagOn('alerts') ? (
        <Section title="Price alerts">
          <Button label="Set up price alerts" tone="ghost" onPress={() => nav.navigate('Alerts')} />
          <T v="caption" style={{ lineHeight: 18 }}>
            A notification the evening any stock closes past a price or its 200-day average.
          </T>
        </Section>
        ) : null}

        <Section title="Your data">
          <BackupCard />
        </Section>

        <Section title="AI">
          <T v="caption" style={{ lineHeight: 18 }}>
            The AI works online. Groq is free; Gemini is optional and tried first when added.
          </T>

          <View style={styles.card}>
            <T v="body" style={{ fontFamily: fonts.semibold }}>
              Gemini (Google)
            </T>
            <T v="caption" style={{ lineHeight: 18 }}>
              Used first when added. Create a key at aistudio.google.com (Get API key). Flash works on the free tier. Pro and Argon
              have no free quota: they need billing turned on for the key's Google Cloud project (a Gemini app subscription does not
              cover the API).
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
    layoutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    layoutBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line },
    radioOn: { borderColor: colors.gold, backgroundColor: colors.gold },
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
