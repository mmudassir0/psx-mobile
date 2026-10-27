/** The tax year on one page: return against the index, best and worst holdings, income, tax and your decisions; shared as a PDF. */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useReviews } from '../portfolio/useReviews';
import { taxYearOf, tradesPref } from '../portfolio/trades';
import { notesPref } from '../portfolio/notes';
import { BENCH_LABEL, benchmarkPref, boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023 } from '../portfolio/tax';
import { snapshots, type Snap } from '../portfolio/track';
import { pkToday } from '../journal/store';
import { snapshotLookup, taxStatement } from '../portfolio/taxStatement';
import { reviewHtml, yearReview, type Mover } from '../portfolio/yearReview';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { logProblem } from '../log';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

const rs = (v: number) => `${v < 0 ? '−' : ''}Rs ${fmtNum(Math.abs(Math.round(v)), 0)}`;
const pc = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');
const pkOf = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

function Movers({ list, empty }: { list: Mover[]; empty: string }) {
  if (!list.length) return <T v="caption">{empty}</T>;
  return (
    <View>
      {list.map((m, i) => (
        <View key={m.symbol} style={[styles.row, i < list.length - 1 && styles.border]}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>{m.symbol}</T>
          <T v="caption" style={{ width: 96, textAlign: 'right' }}>
            {rs(m.rupees)}
          </T>
          <T v="mono" style={{ width: 70, textAlign: 'right', fontSize: 14, color: m.change >= 0 ? colors.up : colors.downText }}>
            {pc(m.change)}
          </T>
        </View>
      ))}
    </View>
  );
}

export default function YearReviewScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  const { name } = useUser();
  const trades = tradesPref.use();
  const notes = notesPref.use();
  const status = taxStatusPref.use();
  const bought = boughtPref.use();
  const bench = benchmarkPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);
  useEffect(() => {
    cached<SeriesPoint[]>(`eod:${bench}`, 30 * 60_000, () => fetchSeries('eod', bench), { persist: true })
      .then(setIndex)
      .catch(() => setIndex([]));
  }, [bench]);
  const today = pkToday();
  const current = taxYearOf(today);
  // in July–September the year just finished is the one to look at
  const [year, setYear] = useState(String(Number(today.slice(5, 7)) >= 7 && Number(today.slice(5, 7)) <= 9 ? current - 1 : current));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const r = useMemo(() => {
    if (!snaps) return null;
    const st = taxStatement({
      year: Number(year),
      trades,
      status,
      bought,
      heldYears: heldSince2023(),
      holdings: rows.map((x) => ({ symbol: x.holding.symbol, shares: x.holding.shares, sector: x.stock?.sector ?? null, dividends: x.dividends })),
      snapshotShares: snapshotLookup(snaps),
    });
    return yearReview({ year: Number(year), today, snaps, trades, notesAt: Object.values(notes).map((n) => pkOf(n.at)), st, index });
  }, [snaps, year, trades, status, bought, rows, notes, index, today]);

  const share = async () => {
    if (!r) return;
    setBusy(true);
    setMsg(null);
    try {
      const html = reviewHtml(r, { name, bench: BENCH_LABEL[bench], made: fmtDay(Date.now()) });
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Sahm year in review ${r.year}`, UTI: 'com.adobe.pdf' });
      }
    } catch (e) {
      logProblem('year review PDF', e);
      setMsg((e as Error).message || "Couldn't make the PDF");
    } finally {
      setBusy(false);
    }
  };

  const beat = r && r.ret != null && r.indexRet != null ? r.ret - r.indexRet : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Year in review
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          options={[
            { key: String(current), label: `This year (${current - 1}–${String(current).slice(2)})` },
            { key: String(current - 1), label: `Last year (${current - 2}–${String(current - 1).slice(2)})` },
          ]}
          value={year}
          onChange={setYear}
        />
        {!r ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          <>
            <Panel style={{ paddingVertical: 14, gap: 10 }}>
              <T v="caption">
                1 July {r.year - 1} – 30 June {r.year}
                {r.partial ? `, so far (to ${r.end ? fmtDay(dayT(r.end)) : 'today'})` : ''}
              </T>
              {r.ret == null ? (
                <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                  {r.start ? 'Not enough days tracked in this year for a return yet.' : "Sahm wasn't tracking your portfolio in this year, so there's no return to show. Trades and dividends recorded for it are below."}
                </T>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <View>
                      <T v="caption">You</T>
                      <T v="mono" style={{ fontSize: 26, color: r.ret >= 0 ? colors.up : colors.downText }}>
                        {pc(r.ret)}
                      </T>
                    </View>
                    <View>
                      <T v="caption">{BENCH_LABEL[bench]}</T>
                      <T v="mono" style={{ fontSize: 26 }}>
                        {pc(r.indexRet)}
                      </T>
                    </View>
                  </View>
                  {beat != null ? (
                    <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: beat >= 0 ? colors.up : colors.downText }}>
                      {Math.abs(beat) < 0.005 ? 'About level with the index.' : beat > 0 ? `${pc(beat)} ahead of the index.` : `${pc(-beat)} behind the index.`}
                    </T>
                  ) : null}
                  <T v="caption" style={{ lineHeight: 17 }}>
                    {r.startValue != null && r.endValue != null
                      ? `${rs(r.startValue)} → ${rs(r.endValue)}, with ${rs(Math.abs(r.added))} ${r.added >= 0 ? 'added' : 'taken out'} along the way${r.start && r.start > r.from ? ` (tracking from ${fmtDay(dayT(r.start))})` : ''}.`
                      : ''}
                  </T>
                </>
              )}
            </Panel>

            <Section title="Best and worst holdings">
              <Panel style={{ paddingVertical: 8, gap: 8 }}>
                <T v="label">Best</T>
                <Movers list={r.best} empty="No holding rose in this period." />
                <T v="label">Worst</T>
                <Movers list={r.worst} empty="No holding fell in this period." />
              </Panel>
              <T v="caption" style={{ lineHeight: 17 }}>
                Price change while you held each one in the year, and what it meant on your shares (dividends not included).
              </T>
            </Section>

            <Section title="Income and tax">
              <Panel style={{ paddingVertical: 8 }}>
                {[
                  ['Cash dividends (before tax)', rs(r.st.divGross)],
                  ['Tax withheld on dividends', rs(r.st.divWithheld)],
                  ['Gains on shares sold', rs(r.st.gains)],
                  ['Losses on shares sold', rs(-r.st.losses)],
                  ['Capital gains tax (estimate)', rs(r.st.cgt)],
                ].map(([k, v], i, all) => (
                  <View key={k} style={[styles.row, i < all.length - 1 && styles.border]}>
                    <T style={{ flex: 1, fontSize: 14 }}>{k}</T>
                    <T v="mono" style={{ fontSize: 14 }}>
                      {v}
                    </T>
                  </View>
                ))}
              </Panel>
            </Section>

            <Section title="Your decisions">
              <Panel style={{ paddingVertical: 12, gap: 6 }}>
                <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                  {r.buys.n || r.sells.n
                    ? `${r.buys.n} buy${r.buys.n === 1 ? '' : 's'} (${rs(r.buys.amount)}) and ${r.sells.n} sale${r.sells.n === 1 ? '' : 's'} (${rs(r.sells.amount)}): ${r.sells.wins} at a profit, ${r.sells.losses} at a loss.`
                    : 'No trades recorded in Sahm for this year.'}
                </T>
                {r.biggestSale ? (
                  <T v="caption">
                    Biggest result: {r.biggestSale.symbol} on {fmtDay(dayT(r.biggestSale.day))}, {rs(r.biggestSale.realised!)}.
                  </T>
                ) : null}
                <T v="caption">
                  {r.notes} note{r.notes === 1 ? '' : 's'} written.
                </T>
              </Panel>
            </Section>

            <Button label={busy ? 'Making the PDF…' : 'Share as PDF'} onPress={share} disabled={busy} />
            {msg ? (
              <T v="caption" style={{ color: colors.downText }}>
                {msg}
              </T>
            ) : null}
            <T v="caption" style={{ lineHeight: 17 }}>
              From Sahm's daily snapshots and the trades and notes recorded in Sahm. Estimates, not tax advice; the tax statement has the details.
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
