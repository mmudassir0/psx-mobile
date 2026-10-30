import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { Button, T } from '../ui/kit';
import { useUser } from '../store/user';
import { Rise } from '../ui/motion';
import { ToolIcon } from '../ui/ToolIcon';
import { ensureReady } from '../notify';
import { setIntraday } from '../portfolio/intraday';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Rect width={36} height={36} rx={10} fill={colors.gold} />
      <Path d="M11 24V14M18 27V9M25 22V12" stroke={colors.onGold} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

type Step = 'name' | 'alerts' | 'widget' | 'holdings';

/**
 * First run: your name, then three short steps — alerts, the home screen widget, and your holdings
 * (ones you already have, or a first plan for new money). Each can be skipped.
 */
export default function WelcomeScreen() {
  const { setName } = useUser();
  const nav = useNavigation();
  const [value, setValue] = useState('');
  const steps: Step[] = Platform.OS === 'android' ? ['name', 'alerts', 'widget', 'holdings'] : ['name', 'alerts', 'holdings'];
  const [i, setI] = useState(0);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const step = steps[i];
  const next = () => setI((k) => Math.min(k + 1, steps.length - 1));

  const finish = (then?: () => void) => {
    setName(value.trim() || 'Investor');
    nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    if (then) setTimeout(then, 50);
  };

  const turnOnAlerts = async () => {
    setAlertMsg(null);
    if (!(await ensureReady())) return setAlertMsg('Notifications are off for Sahm. You can allow them later in the phone settings.');
    if (Platform.OS === 'android') {
      const err = await setIntraday(true);
      if (err) return setAlertMsg(err);
    }
    next();
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.inner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Logo />
            <T style={{ fontFamily: fonts.heavy, fontSize: 22, flex: 1 }}>Sahm</T>
            <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${i + 1} of ${steps.length}`}>
              {steps.map((st, k) => (
                <View key={st} style={[styles.dot, k === i && styles.dotOn]} />
              ))}
            </View>
          </View>

          {step === 'name' ? (
            <Rise key="name" style={{ flex: 1 }}>
              <View style={{ gap: 12, marginTop: 'auto' }}>
                <T v="display" style={{ fontSize: 34, lineHeight: 40 }}>
                  Pakistan's stock market, in your pocket.
                </T>
                <T v="body" style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
                  Live PSX prices and company data, your own portfolio with alerts and dividends, and PKR 1,000,000 of practice money.
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
                  returnKeyType="next"
                  onSubmitEditing={next}
                  accessibilityLabel="Your name"
                />
                <Button label="Next" onPress={next} />
                <T v="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
                  Prices come from the public PSX data portal. Market information, not investment advice.
                </T>
              </View>
            </Rise>
          ) : step === 'alerts' ? (
            <Rise key="alerts" style={{ flex: 1 }}>
              <StepBody glyph="bell" title="Alerts that find you" body="When a stock crosses a price you set, a holding moves a lot, or your day's summary is ready after the close. Sahm checks even when it's closed." />
              <View style={{ gap: 10 }}>
                {alertMsg ? (
                  <T v="caption" style={{ color: colors.downText, lineHeight: 18 }}>
                    {alertMsg}
                  </T>
                ) : null}
                <Button label="Turn on alerts" onPress={turnOnAlerts} />
                <Button label="Later" tone="ghost" onPress={next} />
              </View>
            </Rise>
          ) : step === 'widget' ? (
            <Rise key="widget" style={{ flex: 1 }}>
              <StepBody glyph="grid" title="Sahm on your home screen" body="Your portfolio, watchlist, the market or one stock, without opening the app. Long-press an empty spot on your home screen, tap Widgets, find Sahm and drag one out." />
              <Image source={require('../../assets/widget-preview.png')} style={{ width: '100%', height: undefined, aspectRatio: 500 / 248, borderRadius: 18, marginBottom: 20 }} resizeMode="contain" accessibilityLabel="The Sahm portfolio widget" />
              <Button label="Next" onPress={next} />
            </Rise>
          ) : (
            <Rise key="holdings" style={{ flex: 1 }}>
              <StepBody glyph="briefcase" title="Your shares" body="Holdings stay on this phone only. Add the ones you have, or let Sahm suggest a first spread for new money." />
              <View style={{ gap: 10 }}>
                <Button label="I already have shares" onPress={() => finish(() => nav.navigate('EditHoldings'))} />
                <Button label="I'm starting out" tone="ghost" onPress={() => finish(() => nav.navigate('Tabs', { screen: 'Portfolio', params: { view: 'invest' } }))} />
                <Button label="Just look around" tone="ghost" onPress={() => finish()} />
              </View>
            </Rise>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepBody({ glyph, title, body }: { glyph: string; title: string; body: string }) {
  return (
    <View style={{ gap: 14, marginTop: 'auto', marginBottom: 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ToolIcon name={glyph} size={30} color={colors.gold} />
      </View>
      <T v="display" style={{ fontSize: 30, lineHeight: 36 }}>
        {title}
      </T>
      <T v="body" style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
        {body}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    inner: { flex: 1, padding: 24, paddingTop: 32 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
    dotOn: { width: 20, backgroundColor: colors.gold },
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
  }),
);
