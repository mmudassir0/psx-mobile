/** Results season for your holdings: what's just out (against a year earlier), and when the rest are due. */
import React, { useMemo, useState } from 'react';
import { MarketResults } from '../ui/MarketResults';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { resultsLine } from '../analysis/results';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, Segmented, T, ScreenHeader } from '../ui/kit';

const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');
const KIND = { quarter: 'quarter', half: 'half year', year: 'full year' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ResultsScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const [scope, setScope] = useState<'mine' | 'market'>('mine');

  const out = useMemo(() => rows.filter((r) => r.results?.latest && Date.now() - dayT(r.results.latest.date) < 30 * 864e5).sort((a, b) => b.results!.latest!.date.localeCompare(a.results!.latest!.date)), [rows]);
  const due = useMemo(() => rows.filter((r) => r.next && !out.includes(r)).sort((a, b) => (a.next!.meeting ? -1 : 0) - (b.next!.meeting ? -1 : 0) || a.next!.expected.localeCompare(b.next!.expected)), [rows, out]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Results season" />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          options={[
            { key: 'mine', label: 'My holdings' },
            { key: 'market', label: 'Whole market' },
          ]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'market' ? (
          <MarketResults />
        ) : loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to follow their results." />
        ) : loading && !rows.some((r) => r.next || r.results) ? (
          <Skeleton kind="rows" n={5} label="Reading each company's announcements" />
        ) : (
          <>
            <Section title="Just out (last 30 days)">
              <Panel style={{ paddingVertical: 4 }}>
                {out.length ? (
                  out.map((r, i) => {
                    const l = r.results!.latest!;
                    const tone = l.epsChange == null ? colors.text : l.epsChange >= 0 ? colors.up : colors.downText;
                    return (
                      <Pressable key={r.holding.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: r.holding.symbol })} style={[styles.row, i < out.length - 1 && styles.border]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <T style={{ fontFamily: fonts.bold, fontSize: 14.5, flex: 1 }}>{r.holding.symbol}</T>
                          {l.epsChange != null ? (
                            <T v="mono" style={{ fontSize: 14, color: tone }}>
                              EPS {l.epsChange >= 0 ? '+' : ''}
                              {(l.epsChange * 100).toFixed(0)}%
                            </T>
                          ) : null}
                        </View>
                        <T v="caption" style={{ lineHeight: 17 }}>
                          {resultsLine(l)}
                        </T>
                        {l.url ? (
                          <Pressable onPress={() => Linking.openURL(l.url!).catch(() => {})} hitSlop={6}>
                            <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
                              Read the announcement ›
                            </T>
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <T v="caption" style={{ paddingVertical: 10 }}>
                    None of your holdings has reported in the last 30 days.
                  </T>
                )}
              </Panel>
            </Section>

            <Section title="Coming up">
              <Panel style={{ paddingVertical: 4 }}>
                {due.length ? (
                  due.map((r, i) => {
                    const n = r.next!;
                    const late = n.deadline < today;
                    const end = n.periodEnd;
                    return (
                      <Pressable key={r.holding.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: r.holding.symbol })} style={[styles.row, i < due.length - 1 && styles.border]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <T style={{ fontFamily: fonts.bold, fontSize: 14.5, flex: 1 }}>{r.holding.symbol}</T>
                          <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: n.meeting ? colors.gold : late ? colors.downText : colors.text2 }}>
                            {n.meeting ? 'Board meeting called' : late ? 'Past the deadline' : `~${fmtDay(dayT(n.expected)).replace(/ \d{4}$/, '')}`}
                          </T>
                        </View>
                        <T v="caption" style={{ lineHeight: 17 }}>
                          {n.label} ({KIND[n.kind]} to {Number(end.slice(8, 10))} {MON[Number(end.slice(5, 7)) - 1]}) ·{' '}
                          {n.meeting ? `notice on ${fmtDay(dayT(n.meeting))}, results usually follow within days` : n.basis === 'last year' ? 'around when it reported last year' : 'no date last year to go by'} · PSX
                          deadline {fmtDay(dayT(n.deadline))}
                        </T>
                        {n.lastYear ? (
                          <T v="caption">
                            A year earlier ({n.lastYear.label}): {n.lastYear.eps != null ? `EPS Rs ${n.lastYear.eps.toFixed(2)}` : ''}
                            {n.lastYear.profit != null ? ` · profit Rs ${fmtNum(n.lastYear.profit / 1000, 0)} million` : ''}
                          </T>
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <T v="caption" style={{ paddingVertical: 10 }}>
                    Nothing due that Sahm can see.
                  </T>
                )}
              </Panel>
            </Section>
            <T v="caption" style={{ lineHeight: 18 }}>
              Dates are estimates from when each company reported the same period last year; PSX's rules give 30 days after a quarter, 60 after the half year and 120 after the full year. Your evening alert also tells you
              when results come out.
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
    row: { paddingVertical: 11, gap: 4 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
