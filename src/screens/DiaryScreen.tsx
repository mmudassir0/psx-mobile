/** Portfolio diary: a line a day, written from Sahm's daily snapshots. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { tradesPref } from '../portfolio/trades';
import { notesPref } from '../portfolio/notes';
import { BENCH_LABEL, benchmarkPref } from '../portfolio/prefs';
import { onSnapshots, snapshots, type Snap } from '../portfolio/track';
import { byMonth, diary, diaryExtras } from '../portfolio/diary';
import { monthName } from '../portfolio/monthly';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, T, ScreenHeader } from '../ui/kit';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pk = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export default function DiaryScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const notes = notesPref.use();
  const bench = benchmarkPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
    return onSnapshots(setSnaps);
  }, []);
  useEffect(() => {
    cached<SeriesPoint[]>(`eod:${bench}`, 30 * 60_000, () => fetchSeries('eod', bench), { persist: true })
      .then(setIndex)
      .catch(() => setIndex([]));
  }, [bench]);

  const days = useMemo(() => {
    if (!snaps) return null;
    const extras = diaryExtras({
      trades,
      notes: Object.entries(notes).map(([symbol, n]) => ({ symbol, day: pk(n.at) })),
      bookClosures: rows.flatMap((r) => (r.dividends?.list ?? []).filter((p) => p.bookClosure != null && (p.dps > 0 || p.bonusPct > 0)).map((p) => ({ symbol: r.holding.symbol, day: pk(p.bookClosure!) }))),
    });
    return diary({ snaps, index, extras, indexLabel: BENCH_LABEL[bench] });
  }, [snaps, index, trades, notes, rows, bench]);
  const months = useMemo(() => (days ? byMonth(days) : []), [days]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Portfolio diary" />
      <ScrollView contentContainerStyle={styles.content}>
        {!days ? (
          <Skeleton kind="rows" n={6} />
        ) : !days.length ? (
          <Empty title="The diary starts tomorrow" body="Sahm writes a line for each day it sees your portfolio. Open the app on trading days and the entries fill in here." />
        ) : (
          months.map(([m, list]) => {
            const total = list.reduce((a, d) => a + d.change, 0);
            return (
              <View key={m} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T v="label">{monthName(m)}</T>
                  <T v="mono" style={{ fontSize: 12.5, color: total >= 0 ? colors.up : colors.downText }}>
                    {total >= 0 ? '+' : '−'}Rs {fmtNum(Math.abs(Math.round(total)), 0)}
                  </T>
                </View>
                <Panel style={{ paddingVertical: 4 }}>
                  {list.map((d, i) => (
                    <View key={d.day} style={[styles.row, i < list.length - 1 && styles.border]}>
                      <View style={{ width: 40, alignItems: 'center' }}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{Number(d.day.slice(8, 10))}</T>
                        <T v="caption" style={{ fontSize: 10.5 }}>
                          {DOW[new Date(d.day + 'T12:00:00Z').getUTCDay()]}
                        </T>
                      </View>
                      <View style={[styles.bar, { backgroundColor: d.pct > 0.0005 ? colors.up : d.pct < -0.0005 ? colors.down : colors.line }]} />
                      <T v="body" style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
                        {d.text}
                      </T>
                    </View>
                  ))}
                </Panel>
              </View>
            );
          })
        )}
        {days?.length ? (
          <T v="caption" style={{ lineHeight: 17 }}>
            Written from the daily snapshot Sahm saves when you open it, so a day you didn't open the app is folded into the next one. Money you added or took out isn't counted as a gain or loss.
          </T>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 18 },
    row: { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'flex-start' },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  }),
);
