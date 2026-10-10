import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { Button, T } from '../ui/kit';
import { useUser } from '../store/user';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Rect width={36} height={36} rx={10} fill={colors.gold} />
      <Path d="M11 24V14M18 27V9M25 22V12" stroke={colors.ground} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const { setName } = useUser();
  const nav = useNavigation();
  const [value, setValue] = useState('');

  const start = () => {
    setName(value.trim() || 'Investor');
    nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Logo />
            <T style={{ fontFamily: fonts.heavy, fontSize: 22 }}>Sahm</T>
          </View>
          <View style={{ gap: 12, marginTop: 'auto' }}>
            <T v="display" style={{ fontSize: 34, lineHeight: 40 }}>
              Pakistan's stock market, in your pocket.
            </T>
            <T v="body" style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
              Live PSX prices, charts and company data, plus a paper account with PKR 1,000,000 of practice money to
              trade with.
            </T>
          </View>
          <View style={{ gap: 12, marginTop: 36 }}>
            <T v="label">What should we call you?</T>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="Your name"
              placeholderTextColor={colors.faint}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={start}
              accessibilityLabel="Your name"
            />
            <Button label="Get started" onPress={start} />
            <T v="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
              Prices come from the public PSX data portal. Market information, not investment advice.
            </T>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  inner: { flex: 1, padding: 24, paddingTop: 32 },
  input: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
