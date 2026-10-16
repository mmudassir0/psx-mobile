/** Add, change or paste your real holdings: one per line, "symbol shares average-price". */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { holdingsText, setHoldings, useHoldings } from '../portfolio/holdings';
import { parseHoldings } from '../portfolio/review';
import { useMarket } from '../store/market';
import { Button, IconButton, T } from '../ui/kit';

export default function EditHoldingsScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { bySymbol } = useMarket();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (loaded && !touched) setText(holdingsText(holdings));
  }, [loaded, holdings, touched]);

  const { holdings: parsed, bad } = parseHoldings(text);
  const unknown = bySymbol.size ? parsed.filter((h) => !bySymbol.has(h.symbol)).map((h) => h.symbol) : [];
  const dupes = parsed.map((h) => h.symbol).filter((s, i, a) => a.indexOf(s) !== i);
  const invested = parsed.reduce((a, h) => a + h.shares * h.avgCost, 0);
  const save = async () => {
    await setHoldings(parsed);
    nav.goBack();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          My holdings
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <T v="caption" style={{ lineHeight: 18 }}>
          One holding per line: symbol, number of shares, average buy price. For example "LUCK 200 419.11". Saved on this phone only.
        </T>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setTouched(true);
            setText(t);
          }}
          multiline
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={'LUCK 200 419.11\nOGDC 150 308.33'}
          placeholderTextColor={colors.faint}
          style={styles.input}
          textAlignVertical="top"
        />
        <T v="body" style={{ fontSize: 14 }}>
          {parsed.length} holdings, Rs {Math.round(invested).toLocaleString('en-US')} invested
        </T>
        {bad.length ? (
          <T v="caption" style={{ color: colors.downText }}>
            Can't read: {bad.slice(0, 3).join(' | ')}
            {bad.length > 3 ? ` and ${bad.length - 3} more` : ''}
          </T>
        ) : null}
        {unknown.length ? <T v="caption" style={{ color: colors.downText }}>Not found on PSX: {unknown.join(', ')}</T> : null}
        {dupes.length ? <T v="caption" style={{ color: colors.downText }}>Listed twice: {[...new Set(dupes)].join(', ')}</T> : null}
        <Button label="Save holdings" disabled={!!bad.length || !!dupes.length} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    input: {
      minHeight: 320,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      fontFamily: fonts.mono,
      fontSize: 15,
      color: colors.text,
      lineHeight: 22,
    },
  }),
);
