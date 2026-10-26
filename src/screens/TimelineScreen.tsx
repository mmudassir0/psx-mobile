/** Your portfolio's history in one scroll: trades, dividends, bonuses, results, notes and big days, by month. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { tradesPref } from '../portfolio/trades';
import { notesPref } from '../portfolio/notes';
import { snapshots, type Snap } from '../portfolio/track';
import { sharesFromTrades, snapshotLookup } from '../portfolio/taxStatement';
import { buildTimeline, type EventKind } from '../portfolio/timeline';
import { monthName } from '../portfolio/monthly';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, T } from '../ui/kit';

const ICON: Record<EventKind, string> = { buy: '🟢', sell: '🔴', dividend: '💸', bonus: '🎁', results: '📊', note: '📝', bigday: '⚡', start: '🚩' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TimelineScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const notes = notesPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const events = useMemo(() => {
    if (!snaps) return [];
    const fromSnaps = snapshotLookup(snaps);
    const now = new Map(holdings.map((h) => [h.symbol, h.shares]));
    return buildTimeline({
      trades,
      notes,
      snaps,
      holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, dividends: r.dividends, announcements: r.announcements })),
      sharesOn: (s, day) => sharesFromTrades(trades, s, day, now.get(s) ?? 0) ?? fromSnaps(s, day),
    });
  }, [snaps, trades, notes, rows, holdings]);

  const months = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) m.set(e.day.slice(0, 7), [...(m.get(e.day.slice(0, 7)) ?? []), e]);
    return [...m];
  }, [events]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Timeline
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loaded && !holdings.length && !trades.length ? (
          <Empty title="Nothing yet" body="Your trades, dividends and notes appear here as they happen." />
        ) : !snaps || (loading && !events.length) ? (
          <Skeleton kind="rows" n={6} />
        ) : (
          <>
            {!events.length ? (
              <Empty title="Nothing here yet" body="Record trades with 'Bought or sold', write notes on stocks, and as dividends are paid and days go by they'll show up here." />
            ) : null}
            {months.map(([month, list]) => (
              <View key={month} style={{ gap: 8 }}>
                <T v="label">{monthName(month)}</T>
                <Panel style={{ paddingVertical: 4 }}>
                  {list.map((e, i) => (
                    <Pressable
                      key={`${e.day}${e.kind}${e.title}${i}`}
                      accessibilityRole={e.symbol ? 'button' : undefined}
                      disabled={!e.symbol}
                      onPress={() => e.symbol && nav.navigate('Stock', { symbol: e.symbol })}
                      style={[styles.row, i < list.length - 1 && styles.border]}
                    >
                      <View style={{ width: 34, alignItems: 'center', gap: 2 }}>
                        <T style={{ fontSize: 15 }}>{ICON[e.kind]}</T>
                        <T v="caption" style={{ fontSize: 10.5 }}>
                          {Number(e.day.slice(8, 10))} {MON[Number(e.day.slice(5, 7)) - 1]}
                        </T>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: e.tone > 0 ? colors.up : e.tone < 0 ? colors.downText : colors.text }}>{e.title}</T>
                        {e.sub ? (
                          <T v="caption" numberOfLines={2} style={{ lineHeight: 17 }}>
                            {e.sub}
                          </T>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </Panel>
              </View>
            ))}
            <T v="caption" style={{ lineHeight: 18 }}>
              Trades are the ones recorded in Sahm. Dividends and bonuses are placed on the shares you held at the time, from your trades or
              the daily snapshot, from when Sahm started tracking.
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
    row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
