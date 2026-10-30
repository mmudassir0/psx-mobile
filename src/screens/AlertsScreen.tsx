/**
 * Price alerts: build the rules here, then paste them into the WATCH_ALERTS
 * GitHub secret; the evening job checks them against each close.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { watchCopiedPref, watchlistCopiedPref, watchRulesPref } from '../portfolio/prefs';
import { useUser } from '../store/user';
import { colors, fonts, space, themed } from '../theme';
import { fmtPrice } from '../format';
import { describeRule, priceLine, rulesText, type WatchRule } from '../analysis/watch';
import { useMarket } from '../store/market';
import { Panel } from '../ui/bits';
import { IntradayCard } from '../ui/IntradayCard';
import { intradayChosenPref, intradayPref, setIntraday } from '../portfolio/intraday';
import { ensureReady } from '../notify';
import { Button, IconButton, Section, Segmented, T, ScreenHeader } from '../ui/kit';


export default function AlertsScreen() {
  const nav = useNavigation();
  const rules = watchRulesPref.use();
  const copied = watchCopiedPref.use();
  const { watchlist } = useUser();
  const watchText = watchlist.join(',');
  const watchCopied = watchlistCopiedPref.use();
  const route = useRoute<RouteProp<RootParams, 'Alerts'>>();
  const { bySymbol } = useMarket();
  const [sym, setSym] = useState(route.params?.symbol ?? '');
  const [dir, setDir] = useState<'<' | '>'>('<');
  const [kind, setKind] = useState<'price' | 'ma200' | 'yield' | 'fair'>('price');
  const [px, setPx] = useState('');
  const symU = sym.trim().toUpperCase();
  const known = bySymbol.get(symU);
  const level: WatchRule['level'] = kind === 'ma200' ? 'ma200' : kind === 'fair' ? 'fair' : Number(px.replace(/[,%]/g, ''));
  const ok = !!known && (level === 'ma200' || level === 'fair' || (level as number) > 0);
  const isYield = kind === 'yield';
  const text = rulesText(rules);
  const add = async () => {
    if (!ok) return;
    const rule: WatchRule = isYield ? { symbol: symU, dir, level, yield: true } : { symbol: symU, dir, level };
    await watchRulesPref.set([...rules.filter((r) => !(r.symbol === symU && r.dir === dir && r.level === level && !!r.yield === isYield)), rule]);
    setSym('');
    setPx('');
    // the first alert: switch background checks on (asks for notifications once)
    if (!(await intradayChosenPref.get()) && !(await intradayPref.get()) && (await ensureReady())) setIntraday(true).catch(() => {});
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Price alerts" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <IntradayCard />
        <T v="caption" style={{ lineHeight: 18 }}>
          Get a notification the evening a stock closes past a price or its 200-day average, its dividend yield passes a level (a buy
          zone: "MEBL yield above 9%"), or it falls below Sahm's fair value range. Checked once a day after the close, so it's reliable
          even when your phone kills apps in the background.
        </T>
        <Section title="New alert">
          <Panel style={{ paddingVertical: 14, gap: 10 }}>
            <TextInput value={sym} onChangeText={setSym} placeholder="Symbol, e.g. SYS" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={colors.faint} style={styles.input} />
            {known ? <T v="caption">Now {fmtPrice(known.price)}{known.divYield != null ? ` · dividend yield ${known.divYield.toFixed(1)}%` : ''}</T> : symU.length >= 2 ? <T v="caption" style={{ color: colors.downText }}>Not a PSX symbol</T> : null}
            <Segmented
              options={[
                { key: 'price', label: 'Price' },
                { key: 'ma200', label: '200-day' },
                { key: 'yield', label: 'Yield' },
                { key: 'fair', label: 'Fair value' },
              ]}
              value={kind}
              onChange={setKind}
            />
            <Segmented
              options={[
                { key: '<', label: isYield ? 'Yield falls below' : 'Closes below' },
                { key: '>', label: isYield ? 'Yield rises above' : 'Closes above' },
              ]}
              value={dir}
              onChange={setDir}
            />
            {kind === 'price' || isYield ? (
              <TextInput value={px} onChangeText={setPx} placeholder={isYield ? 'Dividend yield %, e.g. 9' : 'Price (Rs)'} keyboardType="decimal-pad" placeholderTextColor={colors.faint} style={styles.input} />
            ) : null}
            {isYield ? <T v="caption">The last 12 months' cash dividends against the close: a higher yield means a lower price.</T> : null}
            {kind === 'fair' ? <T v="caption">{dir === '<' ? "When the close drops below the low end of Sahm's fair value range: possibly cheap." : 'When the close rises above the high end of the range: possibly expensive.'}</T> : null}
            <Button label="Add alert" onPress={add} disabled={!ok} />
          </Panel>
        </Section>
        {rules.length ? (
          <Section title="Your alerts">
            <Panel style={{ paddingVertical: 4 }}>
              {rules.map((r, i) => {
                const now = bySymbol.get(r.symbol)?.price ?? null;
                const line = priceLine(r);
                const gap = now != null && line != null ? now / line - 1 : null;
                return (
                  <View key={`${r.symbol}${r.dir}${r.level}`} style={[styles.row, i < rules.length - 1 && styles.border]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 14 }}>{describeRule(r)}</T>
                      {r.yield ? (
                        <T v="caption">Yield now {bySymbol.get(r.symbol)?.divYield != null ? `${bySymbol.get(r.symbol)!.divYield!.toFixed(1)}%` : 'not known'}</T>
                      ) : now != null ? (
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
            {text && text !== copied ? (
              <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
                The list has changed since you last copied it: update the secret so the evening job checks the new one.
              </T>
            ) : null}
            <Button
              label="Copy or share the list"
              tone="ghost"
              disabled={!text}
              onPress={() =>
                Share.share({ message: text })
                  .then((r) => (r.action !== Share.dismissedAction ? watchCopiedPref.set(text) : undefined))
                  .catch(() => {})
              }
            />
            <T v="caption" style={{ lineHeight: 18 }}>
              The secret is private: GitHub never shows it in the public logs, and the job prints only how many alerts it checked.
            </T>
          </Panel>
        </Section>
        <Section title="News on your watchlist">
          <Panel style={{ paddingVertical: 14, gap: 10 }}>
            <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
              Each evening, one notification with new PSX announcements (board meetings, material information, payouts, results) for the
              stocks on your watchlist. Put this list in a secret named WATCHLIST_SYMBOLS the same way. The first evening only notes what's
              already there; news comes from the next one.
            </T>
            <View style={styles.code}>
              <T v="mono" selectable style={{ fontSize: 13.5 }}>
                {watchText || 'Your watchlist is empty'}
              </T>
            </View>
            {watchText && watchText !== watchCopied ? (
              <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
                Your watchlist has changed since you last copied it.
              </T>
            ) : null}
            <Button
              label="Copy or share the watchlist"
              tone="ghost"
              disabled={!watchText}
              onPress={() =>
                Share.share({ message: watchText })
                  .then((r) => (r.action !== Share.dismissedAction ? watchlistCopiedPref.set(watchText) : undefined))
                  .catch(() => {})
              }
            />
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
