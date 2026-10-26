/** "If I had put Rs X into this stock back then": real past prices, once or monthly, with dividends, against the KSE-100. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useMarket } from '../store/market';
import { dailyCandles } from '../psx/history';
import { fetchPayouts, fetchSeries } from '../psx/api';
import { cached } from '../psx/cache';
import type { Candle, SeriesPoint } from '../psx/types';
import { dividends, dividendTaxRate, payerKind } from '../analysis/dividends';
import { whatIf, type WhatIfDividend } from '../analysis/whatif';
import { taxStatusPref } from '../portfolio/prefs';
import { Panel } from '../ui/bits';
import { IconButton, Segmented, T } from '../ui/kit';

const INDEXES = ['KSE100', 'KMI30'];
const LABEL: Record<string, string> = { KSE100: 'KSE-100', KMI30: 'KMI-30' };
const YEARS = [
  { key: '1', label: '1 year' },
  { key: '3', label: '3 years' },
  { key: '5', label: '5 years' },
  { key: '10', label: '10 years' },
] as const;
type YearKey = (typeof YEARS)[number]['key'];
const rs = (v: number) => `Rs ${fmtNum(v, 0)}`;
const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

interface Data {
  candles: Candle[];
  divs: WhatIfDividend[];
}

const indexCandles = (s: SeriesPoint[]): Candle[] => s.map((p) => ({ t: p.t, o: p.v, h: p.v, l: p.v, c: p.v, v: 0 }));

async function load(symbol: string, price: number | null, divYield: number | null): Promise<Data> {
  if (INDEXES.includes(symbol)) {
    const s = await cached<SeriesPoint[]>(`eod:${symbol}`, 30 * 60_000, () => fetchSeries('eod', symbol), { persist: true });
    return { candles: indexCandles(s), divs: [] };
  }
  const [candles, payouts] = await Promise.all([dailyCandles(symbol), cached(`payouts:${symbol}`, 6 * 3600_000, () => fetchPayouts(symbol), { persist: true }).catch(() => [])]);
  const d = dividends(payouts, { price, divYield, fiscalEndMonth: 5 });
  return { candles, divs: d.list.map((p) => ({ dps: p.dps, bonusPct: p.bonusPct, bookClosure: p.bookClosure })) };
}

export default function WhatIfScreen() {
  const nav = useNavigation();
  const { stocks, bySymbol } = useMarket();
  const tax = taxStatusPref.use();
  const [symbol, setSymbol] = useState('KSE100');
  const [q, setQ] = useState('');
  const [years, setYears] = useState<YearKey>('5');
  const [amountText, setAmountText] = useState('100000');
  const [how, setHow] = useState<'once' | 'monthly'>('once');
  const [data, setData] = useState<Record<string, Data | 'error'>>({});

  const want = [symbol, 'KSE100'];
  useEffect(() => {
    for (const s of want) {
      if (data[s]) continue;
      const st = bySymbol.get(s);
      load(s, st?.price ?? null, st?.divYield ?? null)
        .then((d) => setData((x) => ({ ...x, [s]: d })))
        .catch(() => setData((x) => ({ ...x, [s]: 'error' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, bySymbol.size]);

  const found = useMemo(() => {
    const u = q.trim().toUpperCase();
    if (!u) return [];
    return stocks.filter((s) => s.symbol.includes(u) || s.name.toUpperCase().includes(u)).sort((a, b) => (a.symbol === u ? -1 : b.symbol === u ? 1 : (b.marketCap ?? 0) - (a.marketCap ?? 0))).slice(0, 5);
  }, [stocks, q]);

  const amount = Math.max(0, Number(amountText.replace(/[^\d.]/g, '')) || 0);
  const start = Date.now() - Number(years) * 365.25 * 864e5;
  const rate = INDEXES.includes(symbol) ? 0 : dividendTaxRate(tax, payerKind(bySymbol.get(symbol)?.sector ?? null));
  const run = (s: string) => {
    const d = data[s];
    if (!d || d === 'error') return null;
    return whatIf({ candles: d.candles, dividends: d.divs, start, amount, monthly: how === 'monthly' ? amount : 0, taxRate: s === symbol ? rate : 0 });
  };
  const r = useMemo(() => run(symbol), [data, symbol, years, amount, how, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = useMemo(() => (symbol === 'KSE100' ? null : run('KSE100')), [data, symbol, years, amount, how]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = data[symbol] === undefined;
  const failed = data[symbol] === 'error';
  const firstShown = r ? r.firstDay : null;
  const short = r && firstShown! - start > 30 * 864e5;
  const name = LABEL[symbol] ?? symbol;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          What if
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[...INDEXES, ...(INDEXES.includes(symbol) ? [] : [symbol])].map((s) => (
            <Pressable key={s} accessibilityRole="button" onPress={() => setSymbol(s)} style={[styles.chip, s === symbol && styles.chipOn]}>
              <T style={{ fontFamily: fonts.bold, fontSize: 13.5, color: s === symbol ? colors.onGold : colors.text }}>{LABEL[s] ?? s}</T>
            </Pressable>
          ))}
        </View>
        <TextInput value={q} onChangeText={setQ} autoCapitalize="characters" autoCorrect={false} placeholder="Or pick a stock" placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Pick a stock" />
        {found.map((s) => (
          <Pressable key={s.symbol} accessibilityRole="button" onPress={() => (setSymbol(s.symbol), setQ(''))} style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}>
            <T style={{ fontFamily: fonts.bold, width: 70 }}>{s.symbol}</T>
            <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
              {s.name}
            </T>
          </Pressable>
        ))}

        <Segmented options={YEARS.map((y) => ({ key: y.key, label: y.label }))} value={years} onChange={setYears} />
        <Segmented
          options={[
            { key: 'once', label: 'All at once' },
            { key: 'monthly', label: 'Every month' },
          ]}
          value={how}
          onChange={setHow}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T v="body" style={{ flex: 1, color: colors.text2 }}>
            {how === 'once' ? 'Amount' : 'Each month'}
          </T>
          <TextInput value={amountText} onChangeText={setAmountText} keyboardType="numeric" style={styles.amount} accessibilityLabel="Amount" />
        </View>

        {loading ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.faint} />
            <T v="caption">Loading {name}'s price history…</T>
          </View>
        ) : failed ? (
          <T v="caption" style={{ color: colors.downText }}>
            Couldn't load {name}'s history. Check the connection and try again.
          </T>
        ) : !r ? (
          <T v="caption">Not enough history for that.</T>
        ) : (
          <>
            <Panel style={{ paddingVertical: 16, gap: 8 }}>
              <T v="body" style={{ color: colors.text2, lineHeight: 22 }}>
                {how === 'once' ? `${rs(amount)} in ${name} on ${fmtDay(r.firstDay)}` : `${rs(amount)} a month in ${name} from ${fmtDay(r.firstDay)} (${r.buys} buys, ${rs(r.invested)} in all)`} would be
              </T>
              <T v="monoLg" style={{ fontSize: 30, color: r.gain >= 0 ? colors.up : colors.downText }}>
                {rs(r.value)}
              </T>
              <T v="body" style={{ fontFamily: fonts.semibold, color: r.gain >= 0 ? colors.up : colors.downText }}>
                {r.gain >= 0 ? `${rs(r.gain)} more than you put in` : `${rs(-r.gain)} less than you put in`} ({pc(r.totalReturn)}
                {r.yearly != null ? `, about ${(r.yearly * 100).toFixed(1)}% a year` : ''})
              </T>
              {short ? <T v="caption">{name}'s history here starts on {fmtDay(r.firstDay)}, so that's when it starts.</T> : null}
              <View style={{ gap: 4, marginTop: 4 }}>
                {!INDEXES.includes(symbol) ? (
                  <>
                    <Line label="Shares today" value={`Rs ${fmtNum(r.holding, 0)}`} />
                    <Line label={`Cash dividends after tax${rate ? ` (${(rate * 100).toFixed(1).replace(/\.0$/, '')}%)` : ''}`} value={rs(r.dividendsNet)} />
                  </>
                ) : null}
                {r.worst ? <Line label={`Lowest point (${fmtDay(r.worst.t)})`} value={`${(r.worst.pct * 100).toFixed(0)}% below the money in`} color={colors.downText} /> : <Line label="Lowest point" value="never below the money in" />}
                {k ? <Line label="The same in the KSE-100" value={`${rs(k.value)} (${pc(k.totalReturn)})`} color={k.value > r.value ? colors.downText : colors.up} /> : null}
              </View>
            </Panel>
            {r.series.length > 5 ? <ValueChart series={r.series} /> : null}
            <T v="caption" style={{ lineHeight: 18 }}>
              Real closing prices, adjusted for bonus issues and splits. {INDEXES.includes(symbol) ? `The ${name} counts dividends as if reinvested.` : 'Dividends are kept as cash, not reinvested; rights issues are left out.'} No
              brokerage or capital gains tax on a sale. The past doesn't promise the future: a good result here can be luck in where the
              dates fall.
            </T>
          </>
        )}
        <Pressable accessibilityRole="button" onPress={() => nav.navigate('Tabs', { screen: 'Portfolio', params: { view: 'risk' } })}>
          <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>What if the market falls 20%? See the stress test for your holdings ›</T>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ValueChart({ series }: { series: { t: number; value: number; invested: number }[] }) {
  const W = 320;
  const H = 140;
  const hi = Math.max(...series.map((s) => Math.max(s.value, s.invested)));
  const lo = Math.min(...series.map((s) => Math.min(s.value, s.invested)), 0);
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo || 1)) * (H - 8);
  const line = (f: (s: (typeof series)[number]) => number) => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(f(s)).toFixed(1)}`).join('');
  return (
    <Panel style={{ paddingVertical: 14, gap: 8 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={line((s) => s.invested)} stroke={colors.faint} strokeWidth={1.4} strokeDasharray="4 4" fill="none" />
        <Path d={line((s) => s.value)} stroke={colors.gold} strokeWidth={1.8} fill="none" />
      </Svg>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 3, backgroundColor: colors.gold, borderRadius: 2 }} />
          <T v="caption">Worth</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 0, borderTopWidth: 2, borderColor: colors.faint, borderStyle: 'dashed' }} />
          <T v="caption">Money put in</T>
        </View>
      </View>
    </Panel>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <T v="body" style={{ flex: 1, fontSize: 13.5, color: colors.text2 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 13.5, color: color ?? colors.text, textAlign: 'right', flexShrink: 1 }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    input: { height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15, color: colors.text, fontFamily: fonts.regular },
    amount: { width: 150, height: 42, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontSize: 15, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
    chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  }),
);
