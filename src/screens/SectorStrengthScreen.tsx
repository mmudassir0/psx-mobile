/** Which sectors lead and lag over a week to six months, how many of their stocks are in an uptrend, and where your money sits. */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { usePicksFeed } from '../picks/feed';
import { sectorRows, type SectorStat } from '../analysis/market';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Segmented, T, ScreenHeader } from '../ui/kit';

type Period = 'r1w' | 'r1m' | 'r3m' | 'r6m';
const LABEL: Record<Period, string> = { r1w: '1 week', r1m: '1 month', r3m: '3 months', r6m: '6 months' };
const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** PSX's full sector name, in normal case ("TEXTILE SPINNING" → "Textile Spinning"); the short names merge some sectors. */
const nameOf = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|Cos)\b/g, (m) => m.toLowerCase()).replace(/\bInv\b/g, 'Inv.');

export default function SectorStrengthScreen() {
  const nav = useNavigation();
  const { market, loading } = usePicksFeed();
  const { holdings } = useHoldings();
  const { bySymbol } = useMarket();
  const [period, setPeriod] = useState<Period>('r1m');
  const rows = useMemo(() => (market ? sectorRows(market) : []), [market]);
  const hasLong = rows.some((r) => r.r3m != null);
  const value = (r: SectorStat) => (period === 'r1w' ? r.r1w : period === 'r1m' ? r.r1m : (period === 'r3m' ? r.r3m : r.r6m) ?? null);
  const sorted = rows.filter((r) => value(r) != null).sort((a, b) => value(b)! - value(a)!);
  const max = Math.max(0.01, ...sorted.map((r) => Math.abs(value(r)!)));

  // your money by sector
  const mine = useMemo(() => {
    const m = new Map<string, number>();
    let total = 0;
    for (const h of holdings) {
      const st = bySymbol.get(h.symbol);
      if (!st?.price) continue;
      const v = st.price * h.shares;
      total += v;
      m.set(key(st.sector), (m.get(key(st.sector)) ?? 0) + v);
    }
    return { m, total };
  }, [holdings, bySymbol]);
  const myShare = (r: SectorStat) => (mine.total ? (mine.m.get(key(r.name)) ?? 0) / mine.total : 0);
  // how much of your money is in the top and bottom third
  const third = Math.ceil(sorted.length / 3);
  const inTop = sorted.slice(0, third).reduce((a, r) => a + myShare(r), 0);
  const inBottom = sorted.slice(-third).reduce((a, r) => a + myShare(r), 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Sector strength" />
      <ScrollView contentContainerStyle={styles.content}>
        {!market ? (
          loading ? (
            <Skeleton kind="rows" n={8} />
          ) : (
            <Empty title="Not available yet" body="Sector figures come with the daily update after the close." />
          )
        ) : (
          <>
            <Segmented
              options={(hasLong ? (['r1w', 'r1m', 'r3m', 'r6m'] as Period[]) : (['r1w', 'r1m'] as Period[])).map((k) => ({ key: k, label: LABEL[k] }))}
              value={period}
              onChange={setPeriod}
            />
            {mine.total > 0 ? (
              <Panel style={{ paddingVertical: 12, gap: 4 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Your money over {LABEL[period]}</T>
                <T v="caption" style={{ lineHeight: 18 }}>
                  {(inTop * 100).toFixed(0)}% is in the strongest third of sectors and {(inBottom * 100).toFixed(0)}% in the weakest third.{' '}
                  {inBottom > 0.5 ? 'Most of it is in sectors lagging the market: worth knowing, not a reason to sell on its own.' : inTop > 0.5 ? 'Most of it is in sectors leading the market.' : ''}
                </T>
              </Panel>
            ) : null}
            <Panel style={{ paddingVertical: 4 }}>
              {sorted.map((r, i) => {
                const v = value(r)!;
                const share = myShare(r);
                return (
                  <View key={r.name} style={[styles.row, i < sorted.length - 1 && styles.border]}>
                    <T v="caption" style={{ width: 20, textAlign: 'right' }}>
                      {i + 1}
                    </T>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                          {nameOf(r.name)}
                        </T>
                        {share > 0 ? <T style={{ fontFamily: fonts.bold, fontSize: 11.5, color: colors.gold }}>You {(share * 100).toFixed(0)}%</T> : null}
                        <T v="mono" style={{ fontSize: 13, color: v >= 0 ? colors.up : colors.downText, width: 62, textAlign: 'right' }}>
                          {pc(v)}
                        </T>
                      </View>
                      <View style={{ flexDirection: 'row', height: 5 }}>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>{v < 0 ? <View style={{ width: `${(Math.abs(v) / max) * 100}%`, height: 5, borderRadius: 2, backgroundColor: colors.down }} /> : null}</View>
                        <View style={{ width: 1, backgroundColor: colors.line }} />
                        <View style={{ flex: 1 }}>{v > 0 ? <View style={{ width: `${(v / max) * 100}%`, height: 5, borderRadius: 2, backgroundColor: colors.up }} /> : null}</View>
                      </View>
                      <T v="caption" style={{ fontSize: 11.5 }}>
                        {(r.up * 100).toFixed(0)}% of its {r.n} stocks in an uptrend{r.vol >= 1.5 ? ` · busy: ${r.vol.toFixed(1)}× usual volume` : ''}
                      </T>
                    </View>
                  </View>
                );
              })}
            </Panel>
            <T v="caption" style={{ lineHeight: 18 }}>
              Average price change of each sector's actively traded stocks, before dividends. "In an uptrend" means above the 200-day average.
              Leaders often keep leading for a while, but they also turn: this shows where the market is, not where it will go. Updated
              after each close{market.day ? ` (figures to ${market.day})` : ''}.
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
