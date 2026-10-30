/** For a holding below your average price: shares to buy to bring the average to a chosen level, or what a sum of money would do. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { costsPref } from '../portfolio/costs';
import { averageWithMoney, sharesForAverage, targetSteps, type AveragePlan } from '../portfolio/averageDown';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, Segmented, T, ScreenHeader } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(Math.round(v), 0)}`;

function Result({ p, avg, held }: { p: AveragePlan; avg: number; held: number }) {
  return (
    <Panel style={{ paddingVertical: 14, gap: 8 }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>
        Buy {fmtNum(p.shares, 0)} shares for about {rs(p.cost)}
      </T>
      <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
        Average Rs {avg.toFixed(2)} → <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.up }}>Rs {p.newAvg.toFixed(2)}</T> on {fmtNum(p.newShares, 0)} shares (you have {fmtNum(held, 0)}).
      </T>
      <T v="caption">Includes about {rs(p.charges)} of trading charges.</T>
      {p.weightAfter != null ? (
        <T v="caption" style={{ color: p.weightAfter > 0.25 ? colors.downText : colors.text2 }}>
          It would then be {(p.weightAfter * 100).toFixed(0)}% of your portfolio{p.weightAfter > 0.25 ? ': a lot in one stock' : ''}.
        </T>
      ) : null}
    </Panel>
  );
}

export default function AverageDownScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootParams, 'AverageDown'>>();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const costs = costsPref.use();
  const below = useMemo(() => rows.filter((r) => r.price > 0 && r.price < r.holding.avgCost), [rows]);
  const [symbol, setSymbol] = useState<string | null>(route.params?.symbol ?? null);
  useEffect(() => {
    if (!symbol && below.length) setSymbol(below[0].holding.symbol);
  }, [below, symbol]);
  const r = rows.find((x) => x.holding.symbol === symbol) ?? null;
  const [mode, setMode] = useState<'target' | 'money'>('target');
  const [text, setText] = useState('');
  useEffect(() => setText(''), [symbol, mode]);
  const portfolio = rows.reduce((a, x) => a + x.value, 0);
  const v = Number(text.replace(/,/g, ''));
  const steps = r ? targetSteps(r.holding.avgCost, r.price) : [];
  const target = mode === 'target' ? (v > 0 ? v : (steps[1] ?? 0)) : 0;
  const p = !r
    ? null
    : mode === 'target'
      ? sharesForAverage(r.holding.shares, r.holding.avgCost, r.price, target, costs, portfolio)
      : v > 0
        ? averageWithMoney(r.holding.shares, r.holding.avgCost, r.price, v, costs, portfolio)
        : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Average down" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings first." />
        ) : loading && !rows.length ? (
          <Skeleton kind="cards" n={2} />
        ) : !below.length && !r ? (
          <Empty title="Nothing below your average" body="Every holding is at or above what you paid, so there's nothing to average down." />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(below.some((x) => x.holding.symbol === symbol) || !r ? below : [r, ...below]).map((x) => {
                const on = x.holding.symbol === symbol;
                return (
                  <Pressable key={x.holding.symbol} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setSymbol(x.holding.symbol)} style={[styles.chip, on && styles.chipOn]}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 13, color: on ? colors.onGold : colors.text2 }}>
                      {x.holding.symbol} {((x.price / x.holding.avgCost - 1) * 100).toFixed(0)}%
                    </T>
                  </Pressable>
                );
              })}
            </ScrollView>
            {r ? (
              <>
                <T v="caption">
                  {fmtNum(r.holding.shares, 0)} shares at an average of Rs {r.holding.avgCost.toFixed(2)}; Rs {r.price.toFixed(2)} now ({((r.price / r.holding.avgCost - 1) * 100).toFixed(1)}%).
                </T>
                {r.price >= r.holding.avgCost ? (
                  <T v="body" style={{ fontSize: 14 }}>
                    {r.holding.symbol} is above your average, so buying more would raise it.
                  </T>
                ) : (
                  <>
                    <Segmented
                      options={[
                        { key: 'target', label: 'To an average of…' },
                        { key: 'money', label: 'With this much money' },
                      ]}
                      value={mode}
                      onChange={setMode}
                    />
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      keyboardType="decimal-pad"
                      placeholder={mode === 'target' ? `Average you want, e.g. ${steps[1]?.toFixed(2) ?? ''}` : 'Rupees to put in'}
                      placeholderTextColor={colors.faint}
                      style={styles.input}
                      accessibilityLabel={mode === 'target' ? 'Average you want' : 'Money to put in'}
                    />
                    {mode === 'target' ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {steps.map((s) => (
                          <Pressable key={s} accessibilityRole="button" onPress={() => setText(s.toFixed(2))} style={styles.fchip}>
                            <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.text2 }}>Rs {s.toFixed(2)}</T>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {p ? (
                      <Result p={p} avg={r.holding.avgCost} held={r.holding.shares} />
                    ) : mode === 'target' && target > 0 ? (
                      <T v="caption" style={{ color: colors.downText }}>
                        {target >= r.holding.avgCost ? 'Pick an average below what you paid.' : `The average can't reach Rs ${target.toFixed(2)}: it has to stay above today's price of Rs ${r.price.toFixed(2)}.`}
                      </T>
                    ) : null}
                    <Section title="Before you buy more">
                      <T v="caption" style={{ lineHeight: 18 }}>
                        A lower average makes it easier to get back to a profit, but it doesn't change what the shares are worth: you're putting more money into a stock that has fallen. Do it only if the reason you
                        bought still holds (your note, results, the chart), and keep an eye on how much of your money ends up in one stock.
                      </T>
                    </Section>
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    chipOn: { backgroundColor: colors.gold },
    fchip: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingHorizontal: 12 },
  }),
);
