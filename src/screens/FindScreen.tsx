/** One search for everything: stocks by symbol or name, and every screen in the app ("zakat", "alerts", "dividends"…). */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { findFeatures } from '../nav/features';
import { useMarket } from '../store/market';
import { StockRow } from '../ui/StockRow';
import { Panel } from '../ui/bits';
import { IconButton, T } from '../ui/kit';
import { ToolsGrid } from '../ui/ToolsGrid';

export default function FindScreen() {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const { stocks } = useMarket();
  const [q, setQ] = useState('');
  const features = findFeatures(q);
  const found = useMemo(() => {
    const u = q.trim().toUpperCase();
    if (!u) return [];
    return stocks
      .filter((s) => s.symbol.includes(u) || s.name.toUpperCase().includes(u))
      .sort((a, b) => (a.symbol === u ? -1 : b.symbol === u ? 1 : 0) || (a.symbol.startsWith(u) ? 0 : 1) - (b.symbol.startsWith(u) ? 0 : 1) || a.symbol.localeCompare(b.symbol))
      .slice(0, 20);
  }, [stocks, q]);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Stock, company or tool (e.g. zakat)"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Search stocks and tools"
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {features.length ? (
          <Panel style={{ paddingVertical: 4 }}>
            {features.map((f, i) => (
              <Pressable key={f.key} accessibilityRole="button" onPress={() => f.go(nav)} style={[styles.row, i < features.length - 1 && styles.border]}>
                <T style={{ fontSize: 20, width: 30 }}>{f.emoji}</T>
                <T style={{ fontFamily: fonts.semibold, fontSize: 15, flex: 1 }}>{f.label}</T>
                <T style={{ color: colors.faint }}>›</T>
              </Pressable>
            ))}
          </Panel>
        ) : null}
        {found.length ? (
          <View>
            {found.map((s, i) => (
              <StockRow key={s.symbol} stock={s} last={i === found.length - 1} onPress={() => nav.navigate('Stock', { symbol: s.symbol })} />
            ))}
          </View>
        ) : null}
        {q.trim() && !features.length && !found.length ? <T v="caption">Nothing matches "{q.trim()}".</T> : null}
        {!q.trim() ? <ToolsGrid title="Or go straight to" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
    input: { flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15.5, color: colors.text, fontFamily: fonts.regular },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
