/** Has each holding's dividend grown, held or been cut over five years? */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { cached, COMPANY_TTL } from '../psx/cache';
import { fetchCompany } from '../psx/api';
import { divGrowth, type DivGrowth } from '../portfolio/divGrowth';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, T, ScreenHeader } from '../ui/kit';

const TONE: Record<DivGrowth['verdict'], () => string> = { growing: () => colors.up, steady: () => colors.text2, cut: () => colors.downText, irregular: () => colors.gold, none: () => colors.faint };
const LABEL: Record<DivGrowth['verdict'], string> = { growing: 'Growing', steady: 'Steady', cut: 'Cut', irregular: 'Up and down', none: 'No dividend' };

export default function DivGrowthScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const [latest, setLatest] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    for (const h of holdings)
      cached(`company:${h.symbol}`, COMPANY_TTL, () => fetchCompany(h.symbol), { persist: true })
        .then((c) => alive && setLatest((m) => ({ ...m, [h.symbol]: c.financialsAnnual?.periods[0] ?? null })))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [holdings]);

  const list = useMemo(
    () =>
      rows
        .filter((r) => r.dividends)
        .map((r) => ({ symbol: r.holding.symbol, g: divGrowth(r.dividends!.years, latest[r.holding.symbol] ?? null) }))
        .sort((a, b) => (b.g.cagr ?? -9) - (a.g.cagr ?? -9)),
    [rows, latest],
  );
  const counts = list.reduce<Record<string, number>>((m, x) => ({ ...m, [x.g.verdict]: (m[x.g.verdict] ?? 0) + 1 }), {});

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Dividend growth" />
      <ScrollView contentContainerStyle={styles.content}>
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to see how their dividends have grown." />
        ) : loading && !rows.length ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          <>
            <Panel style={{ paddingVertical: 12 }}>
              <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                {(['growing', 'steady', 'cut', 'irregular', 'none'] as const)
                  .filter((k) => counts[k])
                  .map((k) => `${counts[k]} ${LABEL[k].toLowerCase()}`)
                  .join(' · ')}
              </T>
            </Panel>
            {list.map(({ symbol, g }) => {
              const max = Math.max(0.01, ...g.years.map((y) => y.dps));
              return (
                <Pressable key={symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol })}>
                  <Panel style={{ paddingVertical: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1 }}>{symbol}</T>
                      <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: TONE[g.verdict]() }}>{LABEL[g.verdict]}</T>
                    </View>
                    {g.years.length ? (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 70 }}>
                        {g.years.map((y) => (
                          <View key={y.fy} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                            <T v="caption" style={{ fontSize: 10 }}>
                              {y.dps > 0 ? y.dps.toFixed(y.dps < 10 ? 2 : 1) : '0'}
                            </T>
                            <View style={{ width: '70%', height: Math.max(2, (y.dps / max) * 44), borderRadius: 3, backgroundColor: y.dps > 0 ? colors.gold : colors.hairline }} />
                            <T v="caption" style={{ fontSize: 10 }}>
                              {y.fy}
                            </T>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <T v="caption" style={{ lineHeight: 17 }}>
                      {g.text}
                    </T>
                  </Panel>
                </Pressable>
              );
            })}
            <T v="caption" style={{ lineHeight: 17 }}>
              Cash dividends per share by fiscal year, from PSX's payout history; the year still being paid is left out. A growing dividend usually follows growing profits; a cut often comes before the price falls
              further. Bonus shares aren't counted here.
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 12 },
  }),
);
