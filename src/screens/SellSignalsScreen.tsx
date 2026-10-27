/** Warning signs across your holdings on one page: rethink prices, Review or Trim, broken charts, dividend cuts and weaker results. */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { targetsPref } from '../portfolio/targets';
import { sellSignals, type Signal } from '../portfolio/sellSignals';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, T } from '../ui/kit';

const DOT: Record<Signal['kind'], () => string> = {
  rethink: () => colors.down,
  review: () => colors.down,
  dividend: () => colors.gold,
  results: () => colors.gold,
  chart: () => colors.gold,
  target: () => colors.up,
};

export default function SellSignalsScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const targets = targetsPref.use();
  const { flagged, clear } = useMemo(
    () =>
      sellSignals(
        rows.map((r) => ({
          symbol: r.holding.symbol,
          price: r.price,
          value: r.value,
          pnlPct: r.holding.avgCost > 0 && r.price > 0 ? r.price / r.holding.avgCost - 1 : null,
          action: r.review?.action ?? null,
          headline: r.review?.headline ?? null,
          fundamentalBreaks: r.review?.fundamentalBreaks ?? [],
          technicalBreaks: r.review?.technicalBreaks ?? [],
          rethink: targets[r.holding.symbol]?.rethink ?? null,
          target: targets[r.holding.symbol]?.target ?? null,
          divCut: r.dividends?.cut ?? null,
          divLower: r.dividends?.lower ?? null,
          epsChange: r.results?.latest?.epsChange ?? null,
          resultsPeriod: r.results?.latest?.period ?? null,
        })),
      ),
    [rows, targets],
  );
  const total = rows.reduce((a, r) => a + r.value, 0);
  const atRisk = flagged.filter((f) => f.score >= 3).reduce((a, f) => a + f.value, 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Warning signs
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to see which ones need a second look." />
        ) : loading && !rows.length ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          <>
            <Panel style={{ paddingVertical: 14, gap: 4 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>{flagged.length ? `${flagged.length} of ${rows.length} holdings to look at again` : 'Nothing to worry about right now'}</T>
              <T v="caption" style={{ lineHeight: 18 }}>
                {flagged.length
                  ? atRisk > 0 && total
                    ? `The strongest signs are on Rs ${fmtNum(atRisk, 0)}, ${Math.round((atRisk / total) * 100)}% of your shares.`
                    : 'Mostly smaller signs: worth a look, nothing urgent.'
                  : 'No rethink prices broken, nothing marked Review or Trim, no broken charts, dividend cuts or weaker results.'}
                {loading ? ' Still checking some holdings…' : ''}
              </T>
            </Panel>
            {flagged.length ? (
              <Section title="Strongest first">
                <Panel style={{ paddingVertical: 4 }}>
                  {flagged.map((f, i) => (
                    <Pressable key={f.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: f.symbol })} style={[styles.row, i < flagged.length - 1 && styles.border]}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1 }}>{f.symbol}</T>
                        <T v="caption">Rs {fmtNum(f.value, 0)}</T>
                        {f.pnlPct != null ? (
                          <T v="mono" style={{ fontSize: 12, color: changeColor(f.pnlPct) }}>
                            {f.pnlPct >= 0 ? '+' : '−'}
                            {Math.abs(f.pnlPct * 100).toFixed(1)}%
                          </T>
                        ) : null}
                      </View>
                      {f.signals.map((s) => (
                        <View key={s.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                          <View style={[styles.dot, { backgroundColor: DOT[s.kind]() }]} />
                          <T v="body" style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
                            {s.text}
                          </T>
                        </View>
                      ))}
                    </Pressable>
                  ))}
                </Panel>
              </Section>
            ) : null}
            {clear.length ? (
              <Section title={`No warnings (${clear.length})`}>
                <T v="body" style={{ fontSize: 14, color: colors.text2, lineHeight: 20 }}>
                  {clear.join(' · ')}
                </T>
              </Section>
            ) : null}
            <T v="caption" style={{ lineHeight: 17 }}>
              Red: your rethink price or Sahm's review. Gold: chart, dividend or results. Green: your own target reached. Signs to look again, not a reason to sell on their own; information, not advice.
            </T>
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    row: { paddingVertical: 12, gap: 6 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  }),
);
