/** Every term Sahm uses, in plain words, with examples from your own holdings. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { TERMS, pickExample, type TermId } from '../analysis/glossary';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { Panel } from '../ui/bits';
import { IconButton, T, ScreenHeader } from '../ui/kit';

export default function GlossaryScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { bySymbol } = useMarket();
  const [open, setOpen] = useState<TermId | null>(null);
  const [q, setQ] = useState('');
  const mine = useMemo(
    () =>
      holdings.map((h) => {
        const s = bySymbol.get(h.symbol);
        return { symbol: h.symbol, shares: h.shares, price: s?.price ?? 0, pe: s?.pe ?? null, divYield: s?.divYield ?? null, marketCap: s?.marketCap ?? null };
      }),
    [holdings, bySymbol],
  );
  const term = (k: TermId) => TERMS[k];
  const ids = (Object.keys(TERMS) as TermId[])
    .filter((k) => !q.trim() || `${TERMS[k].title} ${TERMS[k].body}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => term(a).title.localeCompare(term(b).title));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Words explained" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput value={q} onChangeText={setQ} placeholder="Find a word" placeholderTextColor={colors.faint} style={styles.search} accessibilityLabel="Find a word" />
        <Panel style={{ paddingVertical: 4 }}>
          {ids.map((k, i) => {
            const t = term(k);
            const on = open === k;
            const ex = on ? pickExample(t, mine) : null;
            return (
              <Pressable key={k} accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : k)} style={[styles.row, i < ids.length - 1 && styles.border]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <T style={{ fontFamily: fonts.semibold, fontSize: 14.5, flex: 1 }}>{t.title}</T>
                  <T v="caption">{on ? '−' : '+'}</T>
                </View>
                {on ? (
                  <View style={{ gap: 8, paddingTop: 6 }}>
                    <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                      {t.body}
                    </T>
                    {ex ? (
                      <View style={styles.example}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.gold }}>With your shares</T>
                        <T v="body" style={{ fontSize: 13.5, lineHeight: 19 }}>
                          {ex}
                        </T>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Panel>
        <T v="caption" style={{ lineHeight: 18 }}>
          Tap the small ⓘ next to these words anywhere in Sahm to see the same explanation.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    search: { height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.medium, fontSize: 15 },
    example: { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, gap: 3 },
  }),
);
