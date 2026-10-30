/** Each holding since you bought it: price then and now, best and worst since, and how far from its best. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { tradesPref } from '../portfolio/trades';
import { snapshots, type Snap } from '../portfolio/track';
import { sinceBought, startDay } from '../portfolio/sinceBought';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, T, ScreenHeader } from '../ui/kit';

const pc = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');
const tone = (v: number | null) => (v == null ? colors.text : v >= 0 ? colors.up : colors.downText);

export default function SinceBoughtScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading, candles } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const list = useMemo(() => {
    if (!snaps) return [];
    return rows
      .map((r) =>
        sinceBought({
          symbol: r.holding.symbol,
          candles: candles[r.holding.symbol] ?? [],
          start: startDay(
            r.holding.symbol,
            trades,
            snaps.map((s) => ({ day: s.day, has: (s.pos[r.holding.symbol]?.[0] ?? 0) > 0 })),
          ),
          avgCost: r.holding.avgCost,
          price: r.price,
        }),
      )
      .sort((a, b) => b.onCost - a.onCost);
  }, [rows, candles, trades, snaps]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Since you bought" />
      <ScrollView contentContainerStyle={styles.content}>
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to see how each has done since you bought it." />
        ) : !snaps || (loading && !rows.length) ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          list.map((x) => (
            <Pressable key={x.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: x.symbol })}>
              <Panel style={{ paddingVertical: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1 }}>{x.symbol}</T>
                  <T v="mono" style={{ fontSize: 15, color: tone(x.onCost) }}>
                    {pc(x.onCost)} on cost
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <T v="caption">{x.from && x.startPrice != null ? `${x.basis === 'trade' ? 'Bought' : 'Held from'} ${fmtDay(dayT(x.from))}` : 'Your average'}</T>
                    <T v="mono" style={{ fontSize: 14 }}>
                      Rs {(x.startPrice ?? x.avgCost).toFixed(2)}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="caption">Now</T>
                    <T v="mono" style={{ fontSize: 14, color: tone(x.sinceStart) }}>
                      Rs {x.price.toFixed(2)}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="caption">Best since</T>
                    <T v="mono" style={{ fontSize: 14 }}>
                      {x.best ? `Rs ${x.best.price.toFixed(2)}` : '–'}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="caption">Worst since</T>
                    <T v="mono" style={{ fontSize: 14 }}>
                      {x.worst ? `Rs ${x.worst.price.toFixed(2)}` : '–'}
                    </T>
                  </View>
                </View>
                {x.best && x.worst ? (
                  <View style={styles.track}>
                    {(() => {
                      const lo = x.worst.price;
                      const hi = Math.max(x.best.price, x.price);
                      const at = hi > lo ? (x.price - lo) / (hi - lo) : 1;
                      return <View style={[styles.dot, { left: `${Math.max(0, Math.min(1, at)) * 100}%` }]} />;
                    })()}
                  </View>
                ) : null}
                <T v="caption" style={{ lineHeight: 17 }}>
                  {x.best && x.worst
                    ? `${x.sinceStart != null ? `${pc(x.sinceStart)} since then. ` : ''}Best ${fmtDay(dayT(x.best.day))}, worst ${fmtDay(dayT(x.worst.day))}. ${x.offBest != null && x.offBest > 0.005 ? `Now ${(x.offBest * 100).toFixed(1)}% below its best since.` : 'At its best since.'}`
                    : 'Record your buys with "Bought or sold" (or keep opening Sahm) and the best and worst since will show.'}
                </T>
              </Panel>
            </Pressable>
          ))
        )}
        <T v="caption" style={{ lineHeight: 17 }}>
          Closing prices, before dividends. The start is your first recorded buy, or the first day Sahm's daily record showed the holding.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 12 },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginVertical: 2 },
    dot: { position: 'absolute', top: -3, width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: colors.gold },
  }),
);
