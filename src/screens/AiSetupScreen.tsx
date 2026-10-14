import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { SUGGESTED_MODEL } from '../ai/ollama';
import { IconButton, T } from '../ui/kit';

const TERMUX = 'https://github.com/termux/termux-app/releases/latest';

function Cmd({ children }: { children: string }) {
  return (
    <View style={styles.cmd}>
      <T selectable style={{ fontFamily: 'monospace', fontSize: 13.5, color: colors.text }}>
        {children}
      </T>
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={styles.num}>
        <T style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.onGold }}>{n}</T>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <T v="body" style={{ fontFamily: fonts.semibold }}>
          {title}
        </T>
        {children}
      </View>
    </View>
  );
}

/** One-time setup for the free on-phone AI: Termux + Ollama + a small model. */
export default function AiSetupScreen() {
  const nav = useNavigation();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Set up on-phone AI
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <T v="body" style={{ color: colors.text2 }}>
          Sahm's AI runs entirely on your phone: free, private, no account. It needs Termux (a Linux terminal app) running
          Ollama with a small model of about 2 GB. Setup takes about 10 minutes on Wi-Fi.
        </T>

        <Step n={1} title="Install Termux">
          <T v="caption" style={{ lineHeight: 18 }}>
            Get the arm64-v8a APK from Termux's official GitHub releases. The Play Store version is outdated and won't work.
          </T>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(TERMUX)}>
            <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open Termux releases ›</T>
          </Pressable>
        </Step>

        <Step n={2} title="Install Ollama in Termux">
          <Cmd>pkg update && pkg install ollama</Cmd>
        </Step>

        <Step n={3} title="Start Ollama and keep it running">
          <Cmd>termux-wake-lock; ollama serve</Cmd>
          <T v="caption" style={{ lineHeight: 18 }}>
            Leave this running. In Android settings, set Termux's battery use to "No restrictions" so the phone doesn't stop
            it in the background.
          </T>
        </Step>

        <Step n={4} title="Download the model (about 2 GB)">
          <T v="caption">Swipe from the left edge in Termux and open a new session, then:</T>
          <Cmd>{`ollama pull ${SUGGESTED_MODEL}`}</Cmd>
          <T v="caption" style={{ lineHeight: 18 }}>
            Smaller and faster but less careful: llama3.2:1b. Larger and slower: qwen2.5:7b (needs about 6 GB of free memory).
          </T>
        </Step>

        <Step n={5} title="Come back to Sahm">
          <T v="caption" style={{ lineHeight: 18 }}>
            Tap "Check again" on the AI tab. The first answer takes longer while the model loads; after that, expect a few
            words per second.
          </T>
        </Step>

        <T v="caption" style={{ lineHeight: 18 }}>
          Running Ollama on a computer instead? Start it with OLLAMA_HOST=0.0.0.0 and set its address in Settings → AI.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 40, gap: 24 },
    cmd: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    num: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  }),
);
