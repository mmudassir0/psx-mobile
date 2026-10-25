/** Last month (or this month so far) for your real portfolio: return vs KSE-100, money in and out, dividends, movers, goal. */
import React, { useEffect, useMemo, useState } from 'react';
import { useFlag } from '../flags';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import type { SeriesPoint } from '../psx/types';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import { onSnapshots, snapshots, type Snap } from '../portfolio/track';
import { lastMonth, monthName, monthOf, summarizeMonth, trackedYearly } from '../portfolio/monthly';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { upcomingPayout } from '../analysis/dividends';
import { BENCH_LABEL, benchmarkPref } from '../portfolio/prefs';
import { Panel } from '../ui/bits';
import { GoalCard } from '../ui/GoalCard';
import { Empty, IconButton, Section, Segmented, T } from '../ui/kit';

const pc = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

export default function SummaryScreen() {
  const nav = useNavigation();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  const prev = lastMonth();
  const cur = monthOf(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));
  const [month, setMonth] = useState<string>(prev);
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  useEffect(() => {
    snapshots().then(setSnaps);
    const off = onSnapshots(setSnaps);
    return off;
  }, []);
  const bench = benchmarkPref.use();
  const goalOn = useFlag('summary');
  useEffect(() => {
    setIndex(null);
    cached<SeriesPoint[]>(`eod:${bench}`, 30 * 60_000, () => fetchSeries('eod', bench), { persist: true })
      .then(setIndex)
      .catch(() => setIndex([]));
  }, [bench]);
  const s = useMemo(() => (snaps ? summarizeMonth(snaps, month, index) : null), [snaps, month, index]);
  const hasPrev = useMemo(() => !!snaps?.some((x) => monthOf(x.day) === prev), [snaps, prev]);
  useEffect(() => {
    if (snaps && !hasPrev) setMonth(cur);
  }, [snaps, hasPrev, cur]);
  const coming = rows
    .map((r) => ({ r, up: upcomingPayout(r.dividends) }))
    .filter((x) => x.up && x.up.bookClosure - Date.now() < 35 * 864e5)
    .sort((a, b) => a.up!.bookClosure - b.up!.bookClosure);
  const value = rows.reduce((a, r) => a + r.value, 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Monthly summary
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {hasPrev ? (
          <Segmented
            options={[
              { key: prev, label: monthName(prev) },
              { key: cur, label: `${monthName(cur)} so far` },
            ]}
            value={month}
            onChange={setMonth}
          />
        ) : null}
        {!snaps ? null : !s ? (
          <Empty title="Not enough days yet" body="The summary uses the snapshot Sahm saves each day you open the app. It appears after the second day." />
        ) : (
          <>
            <Panel style={{ paddingVertical: 16, gap: 12 }}>
              <T v="caption">
                {monthName(s.month)}
                {s.partial ? ` (tracking began ${fmtDay(dayT(s.from))})` : ''} · {fmtDay(dayT(s.from))} to {fmtDay(dayT(s.to))}
              </T>
              <View style={{ flexDirection: 'row', gap: 24 }}>
                <View style={{ gap: 2 }}>
                  <T v="caption">You</T>
                  <T v="monoLg" style={{ color: s.ret >= 0 ? colors.up : colors.downText }}>
                    {pc(s.ret)}
                  </T>
                </View>
                <View style={{ gap: 2 }}>
                  <T v="caption" style={{ color: colors.gold }} onPress={() => benchmarkPref.set(bench === 'KSE100' ? 'KMI30' : 'KSE100')}>
                    {BENCH_LABEL[bench]} ⇄
                  </T>
                  <T v="monoLg">{pc(s.index)}</T>
                </View>
              </View>
              {s.index != null ? (
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: s.ret >= s.index ? colors.up : colors.downText }}>
                  {Math.abs(s.ret - s.index) < 0.005 ? 'About the same as the index' : s.ret > s.index ? `${pc(s.ret - s.index)} ahead of the index` : `${pc(s.index - s.ret)} behind the index`}
                </T>
              ) : null}
              <View style={{ gap: 4 }}>
                <Line label="Value at the start" value={`Rs ${fmtNum(s.startValue, 0)}`} />
                <Line label={s.flow >= 0 ? 'Money you added' : 'Money you took out'} value={`Rs ${fmtNum(Math.abs(s.flow), 0)}`} />
                <Line label="Cash dividends earned (before tax)" value={`Rs ${fmtNum(s.dividends, 0)}`} />
                <Line label="Value at the end" value={`Rs ${fmtNum(s.endValue, 0)}`} />
              </View>
            </Panel>
            {s.movers.length ? (
              <Section title="Your holdings this month">
                <Panel style={{ paddingVertical: 8, gap: 6 }}>
                  {s.movers.map((m) => (
                    <Line key={m.symbol} label={m.symbol} value={pc(m.change)} color={m.change >= 0 ? colors.up : colors.downText} />
                  ))}
                  <T v="caption">Price change only, from the first to the last day above.</T>
                </Panel>
              </Section>
            ) : null}
          </>
        )}
        {coming.length ? (
          <Section title="Payouts in the next five weeks">
            <Panel style={{ paddingVertical: 8, gap: 6 }}>
              {coming.map(({ r, up }) => (
                <Line
                  key={r.holding.symbol}
                  label={`${r.holding.symbol} · buy by ${fmtDay(up!.lastBuyDay)}`}
                  value={up!.dps > 0 ? `Rs ${fmtNum(up!.dps * r.holding.shares, 0)}` : `${up!.bonusPct}% bonus`}
                />
              ))}
            </Panel>
          </Section>
        ) : null}
        {rows.length && goalOn ? (
          <Section title="Your goal">
            <GoalCard value={value} tracked={snaps ? trackedYearly(snaps) : null} />
          </Section>
        ) : null}
        <T v="caption" style={{ lineHeight: 18 }}>
          Returns leave out money you added or took out, and count cash dividends before tax, the way the KSE-100 does. They come from
          the snapshot saved each day you open Sahm, so days the app wasn't opened are bridged.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <T v="body" style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 14.5, color: color ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
  }),
);
