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
import * as ImagePicker from 'expo-image-picker';
import { readScreenshots } from '../portfolio/screenshot';
import { aiKeys } from '../store/ai';
import { TradeImport } from '../ui/TradeImport';

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
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const fromScreenshots = async () => {
    setReadMsg(null);
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8, base64: true, quality: 0.6 });
    if (pick.canceled || !pick.assets.length) return;
    setReading(true);
    try {
      const images = pick.assets.filter((a) => a.base64).map((a) => ({ data: a.base64 as string, mime: a.mimeType ?? 'image/jpeg' }));
      const r = await readScreenshots(await aiKeys(), images, bySymbol.size ? (s) => bySymbol.has(s) : undefined, setReadMsg);
      if (!r.holdings.length) {
        setReadMsg(`No holdings found${r.rejected.length ? `: ${r.rejected.join('; ')}` : ''}.`);
        return;
      }
      // Merge: what the screenshots show replaces those lines; other holdings stay.
      const current = parseHoldings(text).holdings;
      const read = new Map(r.holdings.map((h) => [h.symbol, h]));
      const merged = [...current.filter((h) => !read.has(h.symbol)), ...r.holdings].sort((a, b) => a.symbol.localeCompare(b.symbol));
      setTouched(true);
      setText(holdingsText(merged));
      const inv = r.holdings.reduce((a, h) => a + h.shares * h.avgCost, 0);
      setReadMsg(
        `Read ${r.holdings.length} holdings (Rs ${Math.round(inv).toLocaleString('en-US')} invested) from ${images.length} screenshot${images.length > 1 ? 's' : ''}. Check them against your broker before saving.` +
          (r.rejected.length ? ` Skipped: ${r.rejected.join('; ')}.` : ''),
      );
    } catch (e) {
      setReadMsg((e as Error).message);
    } finally {
      setReading(false);
    }
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
          One holding per line: symbol, number of shares, average buy price. For example "LUCK 200 419.11". Or pick screenshots of your broker's portfolio screen and the AI fills them in (the images go to Groq or Gemini
          to be read). Saved on this phone only.
        </T>
        <Button label={reading ? 'Reading screenshots…' : 'Read from broker screenshots'} tone="ghost" disabled={reading} onPress={fromScreenshots} />
        {readMsg ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            {readMsg}
          </T>
        ) : null}
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
            {bad.length > 3 ? ` and ${bad.length - 3} more` : ''}. Each line needs a symbol, shares and average price, like LUCK 200 419.11.
            {(() => {
              // name anything unusual in the line, so a hidden character can be found
              const odd = [...bad[0]].find((ch) => !/[A-Za-z0-9 .,;\t\-]/.test(ch));
              return odd ? ` It holds an unusual character (U+${odd.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}).` : '';
            })()}
          </T>
        ) : null}
        {unknown.length ? (
          <T v="caption" style={{ color: colors.downText }}>
            Not found on PSX: {unknown.join(', ')}
          </T>
        ) : null}
        {dupes.length ? (
          <T v="caption" style={{ color: colors.downText }}>
            Listed twice: {[...new Set(dupes)].join(', ')}
          </T>
        ) : null}
        <Button label="Save holdings" disabled={!!bad.length || !!dupes.length} onPress={save} />
        <T style={{ fontFamily: fonts.bold, fontSize: 16, marginTop: 8 }}>Past trades</T>
        <TradeImport />
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
