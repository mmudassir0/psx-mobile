/** Family portfolios: each one's value and today's change, the family total, and switching which one Sahm shows. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { addPortfolio, allHoldings, deletePortfolio, portfoliosPref, renamePortfolio, switchPortfolio, valueOf } from '../portfolio/portfolios';
import type { Holding } from '../portfolio/review';
import { Panel } from '../ui/bits';
import { Button, IconButton, Section, T, ScreenHeader } from '../ui/kit';

const rs = (v: number) => `${v < 0 ? '−' : ''}Rs ${fmtNum(Math.abs(Math.round(v)), 0)}`;

export default function PortfoliosScreen() {
  const nav = useNavigation();
  const p = portfoliosPref.use();
  const { holdings } = useHoldings();
  const { bySymbol } = useMarket();
  const [all, setAll] = useState<{ id: string; name: string; active: boolean; holdings: Holding[] }[]>([]);
  const [adding, setAdding] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    allHoldings(holdings).then(setAll);
  }, [holdings, p]);

  const vals = all.map((x) => ({ ...x, v: valueOf(x.holdings, (s) => bySymbol.get(s)) }));
  const total = vals.reduce((a, x) => ({ value: a.value + x.v.value, pnl: a.pnl + x.v.pnl, today: a.today + x.v.today }), { value: 0, pnl: 0, today: 0 });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Family portfolios" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {vals.length > 1 ? (
          <Panel style={{ paddingVertical: 14, gap: 4 }}>
            <T v="caption">All together</T>
            <T v="mono" style={{ fontSize: 26 }}>
              {rs(total.value)}
            </T>
            <T v="caption" style={{ color: total.today >= 0 ? colors.up : colors.downText }}>
              Today {total.today >= 0 ? '+' : ''}
              {rs(total.today)} · overall {total.pnl >= 0 ? '+' : ''}
              {rs(total.pnl)}
            </T>
          </Panel>
        ) : null}

        <Section title="Portfolios">
          <Panel style={{ paddingVertical: 4 }}>
            {vals.map((x, i) => (
              <View key={x.id} style={[styles.row, i < vals.length - 1 && styles.border]}>
                <View style={{ flex: 1, gap: 2 }}>
                  {renaming?.id === x.id ? (
                    <TextInput
                      value={renaming.name}
                      onChangeText={(t) => setRenaming({ id: x.id, name: t })}
                      autoFocus
                      onSubmitEditing={() => {
                        portfoliosPref.set(renamePortfolio(p, x.id, renaming.name));
                        setRenaming(null);
                      }}
                      onBlur={() => {
                        portfoliosPref.set(renamePortfolio(p, x.id, renaming.name));
                        setRenaming(null);
                      }}
                      style={styles.input}
                      accessibilityLabel="Portfolio name"
                    />
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityHint="Rename" onLongPress={() => setRenaming({ id: x.id, name: x.name })}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                        {x.name}
                        {x.active ? <T style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.gold }}> · showing</T> : null}
                      </T>
                    </Pressable>
                  )}
                  <T v="caption">
                    {x.holdings.length} holding{x.holdings.length === 1 ? '' : 's'} · {rs(x.v.value)}
                    {x.v.value ? ` · today ${x.v.today >= 0 ? '+' : ''}${rs(x.v.today)}` : ''}
                  </T>
                </View>
                {!x.active ? (
                  confirmDelete === x.id ? (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={async () => {
                          await deletePortfolio(x.id);
                          setConfirmDelete(null);
                        }}
                      >
                        <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.downText }}>Delete</T>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(null)}>
                        <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.faint }}>Keep</T>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${x.name}`} hitSlop={8} onPress={() => setConfirmDelete(x.id)}>
                        <T style={{ fontSize: 13, color: colors.faint }}>✕</T>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={async () => {
                          setBusy(true);
                          await switchPortfolio(x.id);
                          setBusy(false);
                          nav.navigate('Tabs', { screen: 'Portfolio' } as never);
                        }}
                        style={styles.switch}
                      >
                        <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onGold }}>Show</T>
                      </Pressable>
                    </View>
                  )
                ) : null}
              </View>
            ))}
          </Panel>
          <T v="caption">Long-press a name to rename it.</T>
        </Section>

        <Section title="Add a portfolio">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={adding}
              onChangeText={setAdding}
              placeholder="Name, e.g. Ammi, or Ayesha (savings)"
              placeholderTextColor={colors.faint}
              style={[styles.input, { flex: 1 }]}
              accessibilityLabel="New portfolio name"
            />
            <Button
              small
              label="Add"
              disabled={!adding.trim()}
              onPress={() => {
                portfoliosPref.set(addPortfolio(p, adding));
                setAdding('');
              }}
            />
          </View>
        </Section>
        <T v="caption" style={{ lineHeight: 18 }}>
          Each portfolio has its own holdings, trades, notes, goals, targets and history. Sahm shows one at a time: tap Show to switch, then add its holdings in Edit holdings. Settings, trading costs and price alerts are
          shared. The evening holdings alert from GitHub follows the symbols you saved there. Everything stays on this phone and is in the backup.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    input: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingHorizontal: 12 },
    switch: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: colors.gold, justifyContent: 'center' },
  }),
);
