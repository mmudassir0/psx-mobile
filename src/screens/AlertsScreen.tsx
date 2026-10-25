/**
 * Price alerts: build the rules here, then paste them into the WATCH_ALERTS
 * GitHub secret; the evening job checks them against each close.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtPrice } from '../format';
import { makePref } from '../prefs';
import { describeRule, rulesText, type WatchRule } from '../analysis/watch';
import { useMarket } from '../store/market';
import { Panel } from '../ui/bits';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

export const watchRulesPref = makePref<WatchRule[]>('real.watchAlerts', []);

export default function AlertsScreen() {
  const nav = useNavigation();
  const rules = watchRulesPref.use();
  const { bySymbol } = useMarket();
  const [sym, setSym] = useState('');
  const [dir, setDir] = useState<'<' | '>'>('<');
  const [kind, setKind] = useState<'price' | 'ma200'>('price');
  const [px, setPx] = useState('');
  const symU = sym.trim().toUpperCase();
  const known = bySymbol.get(symU);
  const level = kind === 'ma200' ? 'ma200' : Number(px.replace(/,/g, ''));
  const ok = !!known && (level === 'ma200' || (level as number) > 0);
  const text = rulesText(rules);
  const add = async () => {
    if (!ok) return;
    await watchRulesPref.set([...rules.filter((r) => !(r.symbol === symU && r.dir === dir && r.level === level)), { symbol: symU, dir, level }]);
    setSym('');
    setPx('');
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Price alerts
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <T v="caption" style={{ lineHeight: 18 }}>
          Get a notification the evening a stock closes past a price or its 200-day average. Checked once a day after the close, so it's
          reliable even when your phone kills apps in the background.
        </T>
        <Section title="New alert">
          <Panel style={{ paddingVertical: 14, gap: 10 }}>
            <TextInput value={sym} onChangeText={setSym} placeholder="Symbol, e.g. SYS" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={colors.faint} style={styles.input} />
            {known ? <T v="caption">Now {fmtPrice(known.price)}</T> : symU.length >= 2 ? <T v="caption" style={{ color: colors.downText }}>Not a PSX symbol</T> : null}
            <Segmented
              options={[
                { key: '<', label: 'Closes below' },
                { key: '>', label: 'Closes above' },
              ]}
              value={dir}
              onChange={setDir}
            />
            <Segmented
              options={[
                { key: 'price', label: 'A price' },
                { key: 'ma200', label: '200-day average' },
              ]}
              value={kind}
              onChange={setKind}
            />
            {kind === 'price' ? <TextInput value={px} onChangeText={setPx} placeholder="Price (Rs)" keyboardType="decimal-pad" placeholderTextColor={colors.faint} style={styles.input} /> : null}
            <Button label="Add alert" onPress={add} disabled={!ok} />
          </Panel>
        </Section>
        {rules.length ? (
          <Section title="Your alerts">
            <Panel style={{ paddingVertical: 4 }}>
              {rules.map((r, i) => {
                const now = bySymbol.get(r.symbol)?.price ?? null;
                const gap = now != null && r.level !== 'ma200' ? now / r.level - 1 : null;
                return (
                  <View key={`${r.symbol}${r.dir}${r.level}`} style={[styles.row, i < rules.length - 1 && styles.border]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 14 }}>{describeRule(r)}</T>
                      {now != null ? (
                        <T v="caption">
                          Now {fmtPrice(now)}
                          {gap != null ? ` · ${Math.abs(gap * 100).toFixed(1)}% ${gap >= 0 ? 'above' : 'below'} the line` : ''}
                        </T>
                      ) : null}
                    </View>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => watchRulesPref.set(rules.filter((_, k) => k !== i))}>
                      <T style={{ color: colors.downText, fontFamily: fonts.semibold, fontSize: 13.5 }}>Remove</T>
                    </Pressable>
                  </View>
                );
              })}
            </Panel>
          </Section>
        ) : null}
        <Section title="Turn them on">
          <Panel style={{ paddingVertical: 14, gap: 10 }}>
            <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
              The evening job runs on GitHub, so it needs the list there. Copy this, then in GitHub open your repo → Settings → Secrets
              and variables → Actions, and create or update the secret named WATCH_ALERTS with it. Do it again whenever you change the
              list. Alerts arrive on the same ntfy channel as your holdings alerts.
            </T>
            <View style={styles.code}>
              <T v="mono" selectable style={{ fontSize: 13.5 }}>
                {text || 'Add an alert first'}
              </T>
            </View>
            <Button label="Copy or share the list" tone="ghost" disabled={!text} onPress={() => Share.share({ message: text }).catch(() => {})} />
            <T v="caption" style={{ lineHeight: 18 }}>
              The secret is private: GitHub never shows it in the public logs, and the job prints only how many alerts it checked.
            </T>
          </Panel>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    input: { height: 44, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontFamily: fonts.mono, fontSize: 15, color: colors.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    code: { backgroundColor: colors.surface2, borderRadius: 8, padding: 10 },
  }),
);
