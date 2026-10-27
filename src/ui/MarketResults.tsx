/** Results season across the KSE-100 and KMI-30: board meetings called, results just out, and what's likely in the next four weeks. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { useFeedFile } from '../picks/feed';
import { useHoldings } from '../portfolio/holdings';
import { useUser } from '../store/user';
import { isResultsFeed, resultsWindow, type ResultsFeed, type ResultsRow } from '../analysis/marketResults';
import { Panel } from './bits';
import { Skeleton } from './Skeleton';
import { Empty, Section, T } from './kit';

const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

function List({ rows, mine, note }: { rows: ResultsRow[]; mine: Set<string>; note: (r: ResultsRow) => string }) {
  const nav = useNavigation();
  if (!rows.length) return <T v="caption">None right now.</T>;
  return (
    <Panel style={{ paddingVertical: 4 }}>
      {rows.slice(0, 40).map((r, i, all) => (
        <Pressable key={`${r[0]}${r[1]}${r[2]}`} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: r[0] })} style={[styles.row, i < all.length - 1 && styles.border]}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14, width: 72, color: mine.has(r[0]) ? colors.gold : colors.text }}>{r[0]}</T>
          <T v="caption" style={{ flex: 1 }} numberOfLines={1}>
            {note(r)}
          </T>
          <T v="caption">{fmtDay(dayT(r[2]))}</T>
        </Pressable>
      ))}
    </Panel>
  );
}

export function MarketResults() {
  const { data, loading } = useFeedFile<ResultsFeed>('results.json', isResultsFeed);
  const { holdings } = useHoldings();
  const { watchlist } = useUser();
  const mine = new Set([...holdings.map((h) => h.symbol), ...watchlist]);
  if (!data) return loading ? <Skeleton kind="rows" n={6} /> : <Empty title="Not available yet" body="The whole market's results come with the daily update after the close." />;
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const w = resultsWindow(data, today);
  return (
    <View style={{ gap: 16 }}>
      <Section title={`Board meetings called (${w.meetings.length})`}>
        <List rows={w.meetings} mine={mine} note={() => 'Results usually within days'} />
      </Section>
      <Section title={`Results just out (${w.out.length})`}>
        <List rows={w.out} mine={mine} note={(r) => r[3]} />
      </Section>
      <Section title={`Likely in the next four weeks (${w.due.length})`}>
        <List rows={w.due} mine={mine} note={(r) => `${r[3]} results`} />
      </Section>
      <T v="caption" style={{ lineHeight: 17 }}>
        KSE-100 and KMI-30 companies ({data.checked} checked), from the daily update ({fmtDay(dayT(data.day))}). Your holdings and watchlist are in gold. "Likely" dates are when the same results came last year, or PSX's
        deadline.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
