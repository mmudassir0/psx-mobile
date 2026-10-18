/** Sahm's own track record: verdicts and holding decisions you were shown, scored against KSE-100. */
import { BENCHMARK } from '../analysis/market';
import { Skeleton } from '../ui/Skeleton';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import type { Candle, SeriesPoint } from '../psx/types';
import { fetchSeries } from '../psx/api';
import { cached } from '../psx/cache';
import { dailyCandles } from '../psx/history';
import { claim, Entry, H, HORIZONS, scoreEntry, Scored, statsByCall } from '../journal/journal';
import { entries } from '../journal/store';
import { eachLimit } from '../limit';
import { Panel } from '../ui/bits';
import { Empty, IconButton, Section, Segmented, T } from '../ui/kit';

const pc = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const LABEL: Record<H, string> = { 21: 'After 1 month', 63: 'After 3 months' };

export default function RecordScreen() {
  const nav = useNavigation();
  const [list, setList] = useState<Entry[] | null>(null);
  const [scored, setScored] = useState<Scored[] | null>(null);
  const [h, setH] = useState<H>(21);
  const [kind, setKind] = useState<'verdict' | 'holding'>('verdict');

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await entries();
      if (!alive) return;
      setList(all);
      const index = await cached<SeriesPoint[]>(`eod:${BENCHMARK}`, 30 * 60_000, () => fetchSeries('eod', BENCHMARK), { persist: true }).catch(() => null);
      // Only stocks with entries at least a month old need prices.
      const due = [...new Set(all.filter((e) => Date.now() - Date.parse(e.day + 'T12:00:00Z') > 28 * 864e5).map((e) => e.symbol))];
      const candles: Record<string, Candle[]> = {};
      await eachLimit(due, 3, async (s) => {
        const c = await dailyCandles(s).catch(() => null);
        if (c) candles[s] = c;
      }, () => alive);
      if (alive) setScored(all.map((e) => (candles[e.symbol] ? scoreEntry(e, candles[e.symbol], index) : { e, ret: {}, rel: {} })));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mine = useMemo(() => (scored ?? []).filter((s) => s.e.kind === kind), [scored, kind]);
  const stats = useMemo(() => statsByCall(mine, h), [mine, h]);
  const total = (list ?? []).filter((e) => e.kind === kind).length;
  const due = mine.filter((s) => s.ret[h] != null).length;
  const firstDay = (list ?? []).reduce<string | null>((a, e) => (a == null || e.day < a ? e.day : a), null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Sahm's track record
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <T v="caption" style={{ lineHeight: 18 }}>
          Every verdict and holding decision you are shown is saved here with that day's price, then checked against what the price did
          next, compared with KSE-100 over the same days. Nothing is left out.
        </T>
        <Segmented
          options={[
            { key: 'verdict', label: 'Stock verdicts' },
            { key: 'holding', label: 'My holdings' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Segmented options={HORIZONS.map((x) => ({ key: String(x), label: LABEL[x] }))} value={String(h)} onChange={(v) => setH(Number(v) as H)} />
        {!list ? (
          <Skeleton kind="cards" n={3} />
        ) : total === 0 ? (
          <Empty title="Nothing recorded yet" body={kind === 'verdict' ? "Open any stock's AI tab and its verdict is recorded." : 'Your holdings are recorded each day you open My holdings.'} />
        ) : !scored ? (
          <Skeleton kind="rows" n={4} label="Checking prices since then" />
        ) : (
          <>
            <T v="body" style={{ fontSize: 14 }}>
              {total} recorded since {firstDay ? fmtDay(Date.parse(firstDay + 'T12:00:00Z')) : '—'}; {due} old enough to judge {LABEL[h].toLowerCase()}.
            </T>
            {due === 0 ? (
              <Panel style={{ paddingVertical: 14 }}>
                <T v="body" style={{ color: colors.text2, fontSize: 14 }}>
                  None old enough yet. The first results appear {h === 21 ? 'about a month' : 'about three months'} after the first entries.
                </T>
              </Panel>
            ) : (
              <Panel>
                {stats.filter((x) => x.n > 0).map((x, i, arr) => (
                  <View key={x.call} style={[styles.row, i < arr.length - 1 && styles.border]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
                        {x.call} <T v="caption">({x.n})</T>
                      </T>
                      <T v="caption">
                        {x.right != null
                          ? `${Math.round(x.right * 100)}% ${claim({ call: x.call } as Entry) === 'up' ? 'beat' : 'lagged'} KSE-100`
                          : 'no direction claimed'}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <T v="mono" style={{ fontSize: 14 }}>
                        {pc(x.avgRet)}
                      </T>
                      <T v="caption">vs index {pc(x.avgRel)}</T>
                    </View>
                  </View>
                ))}
              </Panel>
            )}
            <Section title="Latest judged">
              <Panel>
                {mine
                  .filter((s) => s.ret[h] != null)
                  .sort((a, b) => (a.e.day < b.e.day ? 1 : -1))
                  .slice(0, 25)
                  .map((s, i, arr) => (
                    <View key={s.e.symbol + s.e.day} style={[styles.row, i < arr.length - 1 && styles.border]}>
                      <View style={{ flex: 1 }}>
                        <T v="body" style={{ fontSize: 14 }}>
                          {s.e.symbol} · {s.e.call}
                        </T>
                        <T v="caption">{fmtDay(Date.parse(s.e.day + 'T12:00:00Z'))}, at Rs {s.e.price.toFixed(2)}</T>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T v="mono" style={{ fontSize: 14, color: (s.ret[h] ?? 0) >= 0 ? colors.up : colors.downText }}>
                          {pc(s.ret[h])}
                        </T>
                        <T v="caption">vs index {pc(s.rel[h])}</T>
                      </View>
                    </View>
                  ))}
                {due === 0 ? <T v="caption" style={{ paddingVertical: 10 }}>Nothing judged yet.</T> : null}
              </Panel>
            </Section>
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
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
