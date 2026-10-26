/** Two or three stocks side by side: a year of price moves on one chart, then value, business, risk and Sahm's view. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import type { RootParams } from '../nav/types';
import { useMarket } from '../store/market';
import { packOf } from '../ai/chat';
import type { StockPack } from '../ai/context';
import { dailyCandles } from '../psx/history';
import type { Candle } from '../psx/types';
import { compareRows, rebased, type CompareRow } from '../analysis/compare';
import { Panel } from '../ui/bits';
import { IconButton, T } from '../ui/kit';

const MAX = 3;
const lineColors = () => [colors.gold, colors.shariah, colors.text2];

interface Loaded {
  pack: StockPack;
  candles: Candle[];
}

export default function CompareScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootParams, 'Compare'>>();
  const { stocks } = useMarket();
  const [syms, setSyms] = useState<string[]>(() => (route.params?.symbols ?? []).slice(0, MAX));
  const [q, setQ] = useState('');
  const [data, setData] = useState<Record<string, Loaded | 'error'>>({});

  useEffect(() => {
    if (!stocks.length) return;
    for (const s of syms) {
      if (data[s]) continue;
      Promise.all([packOf(s, stocks), dailyCandles(s).catch(() => [] as Candle[])])
        .then(([pack, candles]) => setData((d) => ({ ...d, [s]: { pack, candles } })))
        .catch(() => setData((d) => ({ ...d, [s]: 'error' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syms, stocks.length]);

  const found = useMemo(() => {
    const u = q.trim().toUpperCase();
    if (!u) return [];
    return stocks
      .filter((s) => !syms.includes(s.symbol) && (s.symbol.includes(u) || s.name.toUpperCase().includes(u)))
      .sort((a, b) => (a.symbol === u ? -1 : b.symbol === u ? 1 : 0) || (a.symbol.startsWith(u) ? 0 : 1) - (b.symbol.startsWith(u) ? 0 : 1) || (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 6);
  }, [stocks, q, syms]);

  const ready = syms.filter((s) => data[s] && data[s] !== 'error') as string[];
  const loaded = ready.map((s) => data[s] as Loaded);
  const allIn = syms.length >= 2 && ready.length === syms.length;
  const rows = useMemo(
    () => (allIn ? compareRows(loaded.map((l) => ({ pack: l.pack, closes: l.candles.map((c) => c.c) }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allIn, ready.join(','), loaded.length],
  );
  const chart = useMemo(() => (allIn ? rebased(loaded.map((l) => l.candles)) : []), [allIn, ready.join(','), loaded.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (s: string) => {
    setSyms((cur) => (cur.includes(s) || cur.length >= MAX ? cur : [...cur, s]));
    setQ('');
  };
  const remove = (s: string) => setSyms((cur) => cur.filter((x) => x !== s));
  const lc = lineColors();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Compare stocks
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {syms.map((s, i) => (
            <Pressable key={s} accessibilityRole="button" accessibilityLabel={`Remove ${s}`} onPress={() => remove(s)} style={[styles.chip, { borderColor: lc[i] }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: lc[i] }} />
              <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{s}</T>
              {data[s] === undefined ? <ActivityIndicator size="small" color={colors.faint} /> : <T style={{ color: colors.faint }}>✕</T>}
            </Pressable>
          ))}
        </View>
        {syms.length < MAX ? (
          <View style={{ gap: 6 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={syms.length ? 'Add another stock' : 'Add a stock (symbol or name)'}
              placeholderTextColor={colors.faint}
              style={styles.input}
              accessibilityLabel="Add a stock to compare"
            />
            {found.length ? (
              <Panel style={{ paddingVertical: 2 }}>
                {found.map((s, i) => (
                  <Pressable key={s.symbol} accessibilityRole="button" onPress={() => add(s.symbol)} style={[styles.pick, i < found.length - 1 && styles.border]}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 14.5, width: 78 }}>{s.symbol}</T>
                    <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
                      {s.name}
                    </T>
                    <T style={{ color: colors.gold, fontFamily: fonts.bold }}>+</T>
                  </Pressable>
                ))}
              </Panel>
            ) : null}
          </View>
        ) : null}

        {syms.length < 2 ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            Pick two or three stocks, for example two banks or two cement makers, to see them side by side.
          </T>
        ) : !allIn ? (
          syms.some((s) => data[s] === 'error') ? (
            <T v="caption" style={{ color: colors.downText }}>
              Couldn't load {syms.filter((s) => data[s] === 'error').join(', ')}. Check the connection and open this again.
            </T>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.faint} />
              <T v="caption">Loading figures and price history…</T>
            </View>
          )
        ) : (
          <>
            {chart.length > 10 ? <RebasedChart points={chart} syms={syms} colors={lc} /> : null}
            <Table syms={syms} rows={rows} colors={lc} />
            <T v="caption" style={{ lineHeight: 18 }}>
              ★ marks the better figure in each row. A stock can win on most rows and still be the wrong one for you: cheap can mean
              trouble, and calm can mean slow. Figures from PSX and Sahm's own checks; information, not advice.
            </T>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RebasedChart({ points, syms, colors: lc }: { points: { t: number; v: number[] }[]; syms: string[]; colors: string[] }) {
  const W = 320;
  const H = 150;
  const all = points.flatMap((p) => p.v);
  const lo = Math.min(...all, 100);
  const hi = Math.max(...all, 100);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo || 1)) * (H - 8);
  const last = points[points.length - 1];
  return (
    <Panel style={{ paddingVertical: 14, gap: 8 }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text2 }}>Rs 100 in each, a year ago</T>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={`M0 ${y(100)}L${W} ${y(100)}`} stroke={colors.line} strokeWidth={1} strokeDasharray="3 4" />
        {syms.map((s, k) => (
          <Path key={s} d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v[k]).toFixed(1)}`).join('')} stroke={lc[k]} strokeWidth={1.8} fill="none" />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {syms.map((s, k) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: lc[k] }} />
            <T v="caption" style={{ color: colors.text2 }}>
              {s} Rs {last.v[k].toFixed(0)}
            </T>
          </View>
        ))}
      </View>
      <T v="caption">
        From {fmtDay(points[0].t)}, price only (dividends not added).
      </T>
    </Panel>
  );
}

function Table({ syms, rows, colors: lc }: { syms: string[]; rows: CompareRow[]; colors: string[] }) {
  const groups = [...new Set(rows.map((r) => r.group))];
  const wins = syms.map((_, i) => rows.filter((r) => r.best.length === 1 && r.best[0] === i).length);
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1.25 }} />
        {syms.map((s, i) => (
          <View key={s} style={{ flex: 1, alignItems: 'flex-end' }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 14, color: lc[i] }}>{s}</T>
            <T v="caption">★ {wins[i]}</T>
          </View>
        ))}
      </View>
      {groups.map((g) => (
        <Panel key={g} style={{ paddingVertical: 6 }}>
          <T v="label" style={{ paddingVertical: 6 }}>
            {g}
          </T>
          {rows
            .filter((r) => r.group === g)
            .map((r, k, list) => (
              <View key={r.label} style={[styles.row, k < list.length - 1 && styles.border]}>
                <View style={{ flex: 1.25, paddingRight: 6 }}>
                  <T style={{ fontFamily: fonts.semibold, fontSize: 13.5 }}>{r.label}</T>
                  {r.hint ? <T v="caption" style={{ fontSize: 11.5, lineHeight: 15 }}>{r.hint}</T> : null}
                </View>
                {r.values.map((v, i) => {
                  const best = r.best.includes(i);
                  return (
                    <T
                      key={i}
                      v="mono"
                      numberOfLines={2}
                      style={{ flex: 1, textAlign: 'right', fontSize: 13, color: best ? colors.up : v === '–' ? colors.faint : colors.text, fontFamily: best ? fonts.bold : undefined }}
                    >
                      {v}
                      {best ? ' ★' : ''}
                    </T>
                  );
                })}
              </View>
            ))}
        </Panel>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    input: { height: 46, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15.5, color: colors.text, fontFamily: fonts.regular },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 38, borderRadius: 19, borderWidth: 1.5, backgroundColor: colors.surface },
    pick: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    headRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 18 },
  }),
);
