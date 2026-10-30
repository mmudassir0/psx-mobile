import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtSigned } from '../format';
import { fetchIndexConstituents, fetchSeries, INDEX_ABOUT, INDEX_NAMES } from '../psx/api';
import { RangeCard } from '../ui/RangeCard';
import { cached } from '../psx/cache';
import { indexTrend, sectorRows } from '../analysis/market';
import { marketContext } from '../ai/marketContext';
import { usePicksFeed } from '../picks/feed';
import { IndexTrendCard, MarketAi } from '../ui/IndexTrendCard';
import { SectorsCard } from '../ui/SectorsCard';
import { ticksToCandles } from '../psx/parse';
import type { Candle, Constituent, SeriesPoint } from '../psx/types';
import { useMarket } from '../store/market';
import { Change, Empty, IconButton, Section, T, ScreenHeader } from '../ui/kit';
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

function lastSession(ticks: SeriesPoint[]) {
  if (!ticks.length) return ticks;
  const dayOf = (t: number) => Math.floor((t + 5 * 3600_000) / DAY);
  const d = dayOf(ticks[ticks.length - 1].t);
  return ticks.filter((p) => dayOf(p.t) === d);
}

/**
 * Daily index bars. PSX publishes each day's open, close and volume for an
 * index but no high or low, so a candle's wick only spans open to close.
 * Long ranges are grouped into weeks: first open, last close, highest and
 * lowest of those, and the week's total volume.
 */
function eodBars(eod: SeriesPoint[], weekly: boolean): Candle[] {
  const day = eod.map((p) => {
    const o = p.open ?? p.v;
    return { t: p.t, o, h: Math.max(o, p.v), l: Math.min(o, p.v), c: p.v, v: p.vol ?? 0 };
  });
  if (!weekly) return day;
  const weekOf = (t: number) => Math.floor((t + 5 * 3600_000 + 3 * DAY) / (7 * DAY)); // weeks starting Monday
  const out: Candle[] = [];
  for (const b of day) {
    const last = out[out.length - 1];
    if (last && weekOf(last.t) === weekOf(b.t)) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else out.push({ ...b, t: b.t });
  }
  return out;
}

function Row({ c, tab, onPress, last }: { c: Constituent; tab: Tab; onPress: () => void; last: boolean }) {
  const sub = tab === 'active' ? `${fmtCompact(c.volume)} shares traded` : tab === 'movers' ? `${fmtSigned(c.points)} index points` : tab === 'all' ? `${fmtNum(c.weight, 2)}% of index` : c.name;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.symbol}, ${c.name}`} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.6 }]}>
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
  const [ticksErr, setTicksErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force = false) => {
      const ttl = 60_000;
      await Promise.all([
        // kept on the phone too, so a slow connection shows the last copy rather than nothing
        cached(`cons:${code}`, ttl, () => fetchIndexConstituents(code), { force, persist: true })
          .then((d) => {
            setCons(d);
            setConsErr(null);
          })
          .catch((e) => setConsErr((e as Error).message)),
        cached(`int:${code}`, ttl, () => fetchSeries('int', code), { force, persist: true })
          .then((d) => {
            setTicks(d);
            setTicksErr(false);
          })
          .catch(() => {
            setTicks((t) => t ?? []);
            setTicksErr(true);
          }),
        cached(`eod:${code}`, 30 * 60_000, () => fetchSeries('eod', code), { force, persist: true })
          .then(setEod)
          .catch(() => setEod([])),
      ]);
    },
    [code],
  );

  useEffect(() => {
    load();
  }, [load]);
  // something didn't arrive: try again quietly every 20 seconds while the screen is open
  const missing = ticksErr || (consErr != null && cons == null);
  useEffect(() => {
    if (!missing) return;
    const t = setInterval(() => load(true), 20_000);
    return () => clearInterval(t);
  }, [missing, load]);
  // Follow the live market refresh while trading is on.
  useEffect(() => {
    if (marketOpen && updatedAt) load();
  }, [updatedAt, marketOpen, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  // Kept apart so a live refresh of today's ticks doesn't rebuild (and reset) the daily chart.
  const intraday = useMemo(() => ticksToCandles(lastSession(ticks ?? []), 5), [ticks]);
  const daily = useMemo(() => eodBars(eod ?? [], false), [eod]);
  const weekly = useMemo(() => eodBars(eod ?? [], true), [eod]);
  const { bars, unit, visible } = useMemo((): { bars: Candle[]; unit: ChartUnit; visible: number } => {
    if (range === '1D') return { bars: intraday, unit: 'intraday', visible: intraday.length };
    if (range === '5Y') return { bars: weekly, unit: 'week', visible: 261 };
    return { bars: daily, unit: 'day', visible: { '1M': 22, '3M': 63, '1Y': 248 }[range] };
  }, [range, intraday, daily, weekly]);
  const loadingChart = range === '1D' ? ticks == null : eod == null;
  const chartMode: ChartMode = mode;
  const prevClose = quote?.current != null && quote.change != null ? quote.current - quote.change : null;

  const trend = useMemo(() => (eod && eod.length ? indexTrend(eod) : null), [eod]);
  const { market } = usePicksFeed();
  const sectors = useMemo(() => (market ? sectorRows(market) : []), [market]);

  const stats = useMemo(() => {
    if (!cons) return null;
    const up = cons.filter((c) => (c.change ?? 0) > 0).length;
    const down = cons.filter((c) => (c.change ?? 0) < 0).length;
    const volume = cons.reduce((s, c) => s + (c.volume ?? 0), 0);
    const mcap = cons.reduce((s, c) => s + (c.marketCap ?? 0), 0);
    return { up, down, flat: cons.length - up - down, volume, mcap, count: cons.length };
  }, [cons]);
  const aiContext = useMemo(
    () => (trend ? marketContext(INDEX_NAMES[code] ?? code, trend, { breadth: market?.breadth ?? null, sectors, up: stats?.up, down: stats?.down }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trend, market, sectors, code, stats],
  );

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
      <ScreenHeader title={INDEX_NAMES[code] ?? code} />
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={!scrubbing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <View style={[styles.pad, { gap: 6 }]}>
          {INDEX_ABOUT[code] ? (
            <T v="caption" style={{ fontSize: 13.5 }}>
              {INDEX_ABOUT[code]}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="monoXl" style={{ fontSize: 36 }}>
              {fmtNum(quote?.current)}
            </T>
            <Change pct={quote?.changePct} pill />
          </View>
        </View>

        <View style={{ paddingLeft: space.gutter - 4, paddingRight: 4 }}>
          {loadingChart ? (
            <Skeleton kind="chart" height={352} />
          ) : bars.length < 2 ? (
            <View style={{ height: 352, justifyContent: 'center', alignItems: 'center' }}>
              {range === '1D' && ticksErr ? (
                <Pressable accessibilityRole="button" onPress={() => load(true)} style={{ alignItems: 'center', gap: 6 }}>
                  <T v="caption">Couldn't reach PSX for today's chart.</T>
                  <T style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 14 }}>Try again</T>
                </Pressable>
              ) : (
                <T v="caption">No chart data for this range yet.</T>
              )}
            </View>
          ) : (
            <SkiaChart candles={bars} visible={visible} mode={chartMode} unit={unit} prevClose={range === '1D' ? prevClose : null} header={header} onScrubChange={setScrubbing} />
          )}
        </View>

        <View style={[styles.pad, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
          <View style={styles.ranges} accessibilityRole="tablist">
            {RANGES.map((r) => (
              <Pressable key={r} accessibilityRole="tab" accessibilityState={{ selected: r === range }} onPress={() => setRange(r)} style={[styles.range, r === range && styles.rangeOn]}>
                <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: r === range ? colors.text : colors.faint }}>{r}</T>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setMode((m) => (m === 'line' ? 'candle' : 'line'))} style={styles.modeBtn}>
            <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.text }}>{mode === 'line' ? 'Candles' : 'Line'}</T>
          </Pressable>
        </View>

        {mode === 'candle' && range !== '1D' ? (
          <T v="caption" style={[styles.pad, { marginTop: -8 }]}>
            PSX gives no daily high or low for an index, so these candles run from open to close only.
          </T>
        ) : null}

        <View style={[styles.pad, styles.statGrid]}>
          <Stat label="Day high" value={fmtNum(quote?.high)} />
          <Stat label="Day low" value={fmtNum(quote?.low)} />
          <Stat label="Prev. close" value={fmtNum(prevClose)} />
          {stats ? (
            <>
              <Stat label="Stocks" value={String(stats.count)} />
              <Stat label="Volume" value={fmtCompact(stats.volume)} />
              <Stat label="Market cap" value={fmtCompact(stats.mcap)} />
            </>
          ) : null}
        </View>

        {daily.length > 60 ? (
          <View style={[styles.pad, { gap: 10 }]}>
            <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>Likely range</T>
            <RangeCard closes={daily.map((c) => c.c)} price={quote?.current ?? null} kind="index" />
          </View>
        ) : null}

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

        {trend ? (
          <View style={styles.pad}>
            <Section title="Trend">
              <IndexTrendCard t={trend} />
            </Section>
          </View>
        ) : null}

        {sectors.length && code !== 'KMI30' ? (
          <View style={styles.pad}>
            <Section title="Sectors" action="All sectors" onAction={() => nav.navigate('Sectors')}>
              <SectorsCard sectors={sectors} />
            </Section>
          </View>
        ) : null}

        {trend ? (
          <View style={styles.pad}>
            <Section title="AI view of the market">
              <MarketAi id={code} context={aiContext} />
              <T v="caption">Not investment advice.</T>
            </Section>
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
            {tab === 'movers' ? <T v="caption">Index points each stock added or took away today. They add up to the index's change.</T> : null}
            {cons == null && !consErr ? (
              <Skeleton kind="rows" n={6} label="Loading index stocks" />
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
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{showAll ? 'Show fewer' : `Show all ${list.length}`}</T>
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

const styles = themed(() =>
  StyleSheet.create({
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
  }),
);
