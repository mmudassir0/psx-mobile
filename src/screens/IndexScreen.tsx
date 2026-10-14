import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtSigned } from '../format';
import { fetchIndexConstituents, fetchSeries, INDEX_ABOUT, INDEX_NAMES } from '../psx/api';
import { ticksToCandles } from '../psx/parse';
import type { Candle, Constituent, SeriesPoint } from '../psx/types';
import { useMarket } from '../store/market';
import { Change, Empty, IconButton, Loading, Section, T } from '../ui/kit';
import { SkiaChart, ChartMode, ChartUnit } from '../ui/SkiaChart';

type Range = '1D' | '1M' | '3M' | '1Y' | '5Y';
const RANGES: Range[] = ['1D', '1M', '3M', '1Y', '5Y'];
type Tab = 'gainers' | 'losers' | 'active' | 'movers' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'active', label: 'Most active' },
  { key: 'movers', label: 'Index movers' },
  { key: 'all', label: 'All stocks' },
];
const DAY = 86_400_000;

const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function lastSession(ticks: SeriesPoint[]) {
  if (!ticks.length) return ticks;
  const dayOf = (t: number) => Math.floor((t + 5 * 3600_000) / DAY);
  const d = dayOf(ticks[ticks.length - 1].t);
  return ticks.filter((p) => dayOf(p.t) === d);
}

/** EOD index closes as line-chart bars (PSX publishes no daily high/low for indices). */
function eodBars(eod: SeriesPoint[], weekly: boolean): Candle[] {
  if (!eod.length) return [];
  const pts = eod;
  // Weekly sampling for long ranges keeps the line readable.
  const step = weekly ? 5 : 1;
  return pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map((p) => ({ t: p.t, o: p.open ?? p.v, h: p.v, l: p.v, c: p.v, v: p.vol }));
}

function Row({ c, tab, onPress, last }: { c: Constituent; tab: Tab; onPress: () => void; last: boolean }) {
  const sub =
    tab === 'active'
      ? `${fmtCompact(c.volume)} shares traded`
      : tab === 'movers'
        ? `${fmtSigned(c.points)} index points`
        : tab === 'all'
          ? `${fmtNum(c.weight, 2)}% of index`
          : c.name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.symbol}, ${c.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T style={styles.symbol}>{c.symbol}</T>
        <T v="caption" numberOfLines={1} style={tab === 'movers' ? { color: changeColor(c.points) } : undefined}>
          {sub}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T v="mono" style={{ fontSize: 15.5 }}>
          {fmtNum(c.price)}
        </T>
        <Change pct={c.changePct} pill />
      </View>
    </Pressable>
  );
}

export default function IndexScreen() {
  const nav = useNavigation();
  const { code } = useRoute<RouteProp<RootParams, 'Index'>>().params;
  const { indices, updatedAt, marketOpen } = useMarket();
  const quote = indices.find((i) => i.code === code);
  const [range, setRange] = useState<Range>('1D');
  const [mode, setMode] = useState<ChartMode>('line');
  const [tab, setTab] = useState<Tab>('gainers');
  const [showAll, setShowAll] = useState(false);
  const [ticks, setTicks] = useState<SeriesPoint[] | null>(null);
  const [eod, setEod] = useState<SeriesPoint[] | null>(null);
  const [cons, setCons] = useState<Constituent[] | null>(null);
  const [consErr, setConsErr] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force = false) => {
      const ttl = force ? 0 : 60_000;
      await Promise.all([
        cached(`cons:${code}`, ttl, () => fetchIndexConstituents(code))
          .then((d) => {
            setCons(d);
            setConsErr(null);
          })
          .catch((e) => setConsErr((e as Error).message)),
        cached(`int:${code}`, ttl, () => fetchSeries('int', code))
          .then(setTicks)
          .catch(() => setTicks([])),
        cached(`eod:${code}`, 30 * 60_000, () => fetchSeries('eod', code))
          .then(setEod)
          .catch(() => setEod([])),
      ]);
    },
    [code],
  );

  useEffect(() => {
    load();
  }, [load]);
  // Follow the live market refresh while trading is on.
  useEffect(() => {
    if (marketOpen && updatedAt) load();
  }, [updatedAt, marketOpen, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const { bars, unit, visible } = useMemo((): { bars: Candle[]; unit: ChartUnit; visible: number } => {
    if (range === '1D') {
      const b = ticksToCandles(lastSession(ticks ?? []), 5);
      return { bars: b, unit: 'intraday', visible: b.length };
    }
    const visible = { '1M': 22, '3M': 63, '1Y': 248, '5Y': 261 }[range];
    return { bars: eodBars(eod ?? [], range === '5Y'), unit: range === '5Y' ? 'month' : 'day', visible };
  }, [range, ticks, eod]);
  const loadingChart = range === '1D' ? ticks == null : eod == null;
  const chartMode: ChartMode = range === '1D' ? mode : 'line';
  const prevClose = quote?.current != null && quote.change != null ? quote.current - quote.change : null;

  const stats = useMemo(() => {
    if (!cons) return null;
    const up = cons.filter((c) => (c.change ?? 0) > 0).length;
    const down = cons.filter((c) => (c.change ?? 0) < 0).length;
    const volume = cons.reduce((s, c) => s + (c.volume ?? 0), 0);
    const mcap = cons.reduce((s, c) => s + (c.marketCap ?? 0), 0);
    return { up, down, flat: cons.length - up - down, volume, mcap, count: cons.length };
  }, [cons]);

  const list = useMemo(() => {
    if (!cons) return [];
    const by = (f: (c: Constituent) => number) => [...cons].sort((a, b) => f(b) - f(a));
    switch (tab) {
      case 'gainers':
        return by((c) => c.changePct ?? -Infinity).filter((c) => (c.changePct ?? 0) > 0);
      case 'losers':
        return by((c) => -(c.changePct ?? Infinity)).filter((c) => (c.changePct ?? 0) < 0);
      case 'active':
        return by((c) => c.volume ?? 0);
      case 'movers':
        return by((c) => Math.abs(c.points ?? 0));
      default:
        return by((c) => c.weight ?? 0);
    }
  }, [cons, tab]);
  const shown = showAll ? list : list.slice(0, 10);

  const rangeChange = bars.length > 1 ? (range === '1D' && prevClose ? bars[bars.length - 1].c - prevClose : bars[bars.length - 1].c - bars[Math.max(0, bars.length - visible)].c) : null;
  const rangeBase = range === '1D' ? prevClose : bars[Math.max(0, bars.length - visible)]?.c;
  const rangePct = rangeChange != null && rangeBase ? (rangeChange / rangeBase) * 100 : null;

  const header = useCallback(
    (bar: Candle | null) =>
      bar ? (
        <T v="mono" style={{ fontSize: 13, marginLeft: 4 }} numberOfLines={1}>
          <T style={{ color: colors.text2 }}>{unit === 'intraday' ? fmtDateTime(bar.t).split(', ')[1] : fmtDay(bar.t)}</T>
          {'   '}
          {fmtNum(bar.c)}
          {range === '1D' && prevClose ? (
            <T style={{ color: changeColor(bar.c - prevClose) }}>
              {'   '}
              {fmtSigned(bar.c - prevClose)} pts
            </T>
          ) : null}
        </T>
      ) : (
        <T v="caption" style={{ fontSize: 13, marginLeft: 4, color: changeColor(rangeChange) }} numberOfLines={1}>
          {fmtSigned(rangeChange)} pts ({fmtPct(rangePct)}){' '}
          <T v="caption" style={{ fontSize: 13 }}>
            {range === '1D' ? 'today' : `over ${range}`}
          </T>
        </T>
      ),
    [unit, range, prevClose, rangeChange, rangePct],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          {INDEX_NAMES[code] ?? code}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={!scrubbing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <View style={[styles.pad, { gap: 6 }]}>
          {INDEX_ABOUT[code] ? <T v="caption" style={{ fontSize: 13.5 }}>{INDEX_ABOUT[code]}</T> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="monoXl" style={{ fontSize: 36 }}>
              {fmtNum(quote?.current)}
            </T>
            <Change pct={quote?.changePct} pill />
          </View>
        </View>

        <View style={{ paddingLeft: space.gutter - 4, paddingRight: 4 }}>
          {loadingChart ? (
            <View style={{ height: 352, justifyContent: 'center' }}>
              <Loading />
            </View>
          ) : bars.length < 2 ? (
            <View style={{ height: 352, justifyContent: 'center', alignItems: 'center' }}>
              <T v="caption">No chart data for this range yet.</T>
            </View>
          ) : (
            <SkiaChart candles={bars} visible={visible} mode={chartMode} unit={unit} prevClose={range === '1D' ? prevClose : null} header={header} onScrubChange={setScrubbing} />
          )}
        </View>

        <View style={[styles.pad, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
          <View style={styles.ranges} accessibilityRole="tablist">
            {RANGES.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="tab"
                accessibilityState={{ selected: r === range }}
                onPress={() => setRange(r)}
                style={[styles.range, r === range && styles.rangeOn]}
              >
                <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: r === range ? colors.text : colors.faint }}>{r}</T>
              </Pressable>
            ))}
          </View>
          {range === '1D' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode((m) => (m === 'line' ? 'candle' : 'line'))}
              style={styles.modeBtn}
            >
              <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.text }}>{mode === 'line' ? 'Candles' : 'Line'}</T>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.pad, styles.statGrid]}>
          <Stat label="Day high" value={fmtNum(quote?.high)} />
          <Stat label="Day low" value={fmtNum(quote?.low)} />
          <Stat label="Prev. close" value={fmtNum(prevClose)} />
          <Stat label="Stocks" value={stats ? String(stats.count) : '—'} />
          <Stat label="Volume" value={stats ? fmtCompact(stats.volume) : '—'} />
          <Stat label="Market cap" value={stats ? fmtCompact(stats.mcap) : '—'} />
        </View>

        {stats ? (
          <View style={[styles.pad, { gap: 8 }]}>
            <View style={styles.breadth}>
              <View style={{ flex: stats.up || 0.0001, backgroundColor: colors.up }} />
              <View style={{ flex: stats.flat || 0.0001, backgroundColor: colors.faint }} />
              <View style={{ flex: stats.down || 0.0001, backgroundColor: colors.down }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="caption" style={{ color: colors.up }}>
                {stats.up} up
              </T>
              <T v="caption">{stats.flat} unchanged</T>
              <T v="caption" style={{ color: colors.downText }}>
                {stats.down} down
              </T>
            </View>
          </View>
        ) : null}

        <View style={styles.pad}>
          <Section title="Stocks in this index">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TABS.map((t) => (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: t.key === tab }}
                  onPress={() => {
                    setTab(t.key);
                    setShowAll(false);
                  }}
                  style={[styles.chip, t.key === tab && styles.chipOn]}
                >
                  <T style={{ fontFamily: fonts.bold, fontSize: 13, color: t.key === tab ? colors.onGold : colors.text2 }}>{t.label}</T>
                </Pressable>
              ))}
            </ScrollView>
            {tab === 'movers' ? (
              <T v="caption">Index points each stock added or took away today. They add up to the index's change.</T>
            ) : null}
            {cons == null && !consErr ? (
              <Loading label="Loading index stocks" />
            ) : consErr ? (
              <Empty title="Couldn't load the stocks" body={`${consErr}. Pull down to retry.`} />
            ) : shown.length === 0 ? (
              <Empty title={tab === 'gainers' ? 'No gainers today' : tab === 'losers' ? 'No losers today' : 'No stocks'} />
            ) : (
              <View>
                {shown.map((c, i) => (
                  <Row key={c.symbol} c={c} tab={tab} last={i === shown.length - 1} onPress={() => nav.navigate('Stock', { symbol: c.symbol })} />
                ))}
              </View>
            )}
            {list.length > 10 ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.more}>
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>
                  {showAll ? 'Show fewer' : `Show all ${list.length}`}
                </T>
              </Pressable>
            ) : null}
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.33%', gap: 3 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 14 }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  content: { paddingTop: 4, paddingBottom: 40, gap: 22 },
  pad: { paddingHorizontal: space.gutter },
  ranges: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 3 },
  range: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rangeOn: { backgroundColor: colors.line },
  modeBtn: { height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  breadth: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  symbol: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  more: { paddingVertical: 12, alignItems: 'center' },
}));
