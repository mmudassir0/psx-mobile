import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, changeColor, fonts, space, themed } from '../theme';
import { fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtPrice, fmtSigned } from '../format';
import { technicals } from '../analysis/technicals';
import { ActionChip, KV, Panel, RangeBar, TabStrip } from '../ui/bits';
import { TechnicalsTab } from './stock/TechnicalsTab';
import { FundamentalsTab } from './stock/FundamentalsTab';
import { NewsTab } from './stock/NewsTab';
import { ProfileTab } from './stock/ProfileTab';
import { PeersTab } from './stock/PeersTab';
import { AiTab } from './stock/AiTab';
import { balanceSheetFor, computeRatios } from '../analysis/ratios';
import type { StockPack } from '../ai/context';
import { fetchCompany, fetchSeries } from '../psx/api';
import { cached, COMPANY_TTL } from '../psx/cache';
import { dailyCandles } from '../psx/history';
import { groupCandles, ticksToCandles } from '../psx/parse';
import type { Candle, CompanyInfo, SeriesPoint } from '../psx/types';
import { useMarket, useStock } from '../store/market';
import { useUser } from '../store/user';
import { Badge, Button, Change, Icon, IconButton, Section, T } from '../ui/kit';
import { SkiaChart, ChartMode, ChartLevel, ChartLine, ChartMarker, ChartPanes } from '../ui/SkiaChart';
import { usePicksFeed } from '../picks/feed';
import { useHoldings } from '../portfolio/holdings';
import { BENCHMARK, relativeReturn } from '../analysis/market';
import { load as loadPref, save as savePref } from '../storage';
import { analyze, computeSeries } from '../analysis/signals';
import { Backtest, backtest } from '../analysis/backtest';
import { valueStock } from '../analysis/valuation';

type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'Max';
const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'Max'];
const DAY = 86_400_000;


/** The latest session's ticks only (the intraday feed can include earlier days). */
function lastSession(ticks: SeriesPoint[]): SeriesPoint[] {
  if (!ticks.length) return ticks;
  const dayOf = (t: number) => Math.floor((t + 5 * 3600_000) / DAY);
  const d = dayOf(ticks[ticks.length - 1].t);
  return ticks.filter((p) => dayOf(p.t) === d);
}

function barsFor(range: Range, daily: Candle[], intraday: Candle[]): { bars: Candle[]; unit: 'intraday' | 'day' | 'week' | 'month'; visible: number } {
  // pass the whole history; `visible` is how much shows first, the rest is a swipe away
  if (range === '1D') return { bars: intraday, unit: 'intraday', visible: intraday.length };
  if (!daily.length) return { bars: [], unit: 'day', visible: 0 };
  switch (range) {
    case '1W':
      return { bars: daily, unit: 'day', visible: 5 };
    case '1M':
      return { bars: daily, unit: 'day', visible: 22 };
    case '3M':
      return { bars: daily, unit: 'day', visible: 63 };
    case '1Y':
      return { bars: daily, unit: 'day', visible: 248 };
    case '5Y': {
      const w = groupCandles(daily, 'week');
      return { bars: w, unit: 'week', visible: 261 };
    }
    default: {
      const m = groupCandles(daily, 'month');
      return { bars: m, unit: 'month', visible: m.length };
    }
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 14.5 }}>
        {value}
      </T>
      {sub ? (
        <T v="caption" style={{ fontSize: 11.5 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

function Ohlc({ c, unit }: { c: Candle; unit: string }) {
  const col = c.c >= c.o ? colors.up : colors.down;
  const k = (t: string) => <T style={{ color: colors.faint }}>{t} </T>;
  return (
    <T v="mono" style={{ fontSize: 13, color: colors.text }} numberOfLines={1}>
      <T style={{ color: colors.text2 }}>{unit === 'intraday' ? fmtDateTime(c.t).split(', ')[1] : fmtDay(c.t).replace(/ \d{4}$/, '')}</T>
      {'   '}
      {k('O')}
      {fmtPrice(c.o)}
      {'  '}
      {k('H')}
      {fmtPrice(c.h)}
      {'  '}
      {k('L')}
      {fmtPrice(c.l)}
      {'  '}
      {k('C')}
      <T style={{ color: col }}>{fmtPrice(c.c)}</T>
    </T>
  );
}

type Tab = 'overview' | 'ai' | 'fundamentals' | 'technicals' | 'news';
// Five tabs that fit the screen: the company profile is at the end of Overview, peers at the end of Financials.
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ai', label: 'AI' },
  { key: 'fundamentals', label: 'Financials' },
  { key: 'technicals', label: 'Technicals' },
  { key: 'news', label: 'News' },
];
type Extra = 'ma' | 'bb' | 'levels' | 'w52' | 'pick' | 'cross' | 'rsi' | 'macd' | 'fair';
const MORE_EXTRAS: Extra[] = ['bb', 'w52', 'cross', 'rsi', 'macd'];

function More({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingTop: 4 }}>
      <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{label} ›</T>
    </Pressable>
  );
}

export default function StockScreen() {
  const nav = useNavigation();
  const { symbol } = useRoute<RouteProp<RootParams, 'Stock'>>().params;
  const stock = useStock(symbol);
  const { isWatched, toggleWatch, account } = useUser();
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('1M');
  const [mode, setMode] = useState<ChartMode>('candle');
  // Chart extras, remembered between stocks
  const [moreOpen, setMoreOpen] = useState(false);
  const [extras, setExtras] = useState<Extra[]>([]);
  useEffect(() => {
    loadPref<Extra[]>('chart.extras', []).then(setExtras);
  }, []);
  const toggleExtra = (k: Extra) =>
    setExtras((cur) => {
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      savePref('chart.extras', next);
      return next;
    });
  const [kse, setKse] = useState<SeriesPoint[] | null>(null);
  const [kmi, setKmi] = useState<SeriesPoint[] | null>(null);
  useEffect(() => {
    cached<SeriesPoint[]>(`eod:${BENCHMARK}`, 30 * 60_000, () => fetchSeries('eod', BENCHMARK), { persist: true }).then(setKse).catch(() => {});
  }, []);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyErr, setCompanyErr] = useState<string | null>(null);
  const [daily, setDaily] = useState<Candle[] | null>(null);
  const [ticks, setTicks] = useState<SeriesPoint[] | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    (force = false) => {
      let alive = true;
      const jobs = [
        cached(`company:${symbol}`, COMPANY_TTL, () => fetchCompany(symbol), { persist: true, force })
          .then((c) => {
            if (!alive) return;
            setCompany(c);
            setCompanyErr(null);
          })
          .catch((e) => alive && setCompanyErr((e as Error).message)),
        dailyCandles(symbol, { force })
          .then((d) => {
            if (!alive) return;
            setDaily(d);
            setChartErr(null);
          })
          .catch((e) => {
            if (!alive) return;
            setDaily((cur) => cur ?? []);
            setChartErr((e as Error).message);
          }),
        cached(`int:${symbol}`, 60_000, () => fetchSeries('int', symbol), { force })
          .then((d) => alive && setTicks(d))
          .catch(() => alive && setTicks((cur) => cur ?? [])),
      ];
      return {
        done: Promise.all(jobs),
        cancel: () => {
          alive = false;
        },
      };
    },
    [symbol],
  );
  useEffect(() => load().cancel, [load]);
  const onRefresh = async () => {
    setRefreshing(true);
    await load(true).done;
    setRefreshing(false);
  };

  const intradayBars = useMemo(() => ticksToCandles(lastSession(ticks ?? []), 5), [ticks]);
  const { bars, unit, visible } = useMemo(() => barsFor(range, daily ?? [], intradayBars), [range, daily, intradayBars]);
  const loadingChart = range === '1D' ? ticks == null : daily == null;
  const series = useMemo(() => (daily && daily.length ? computeSeries(daily) : null), [daily]);
  const analysis = useMemo(() => (daily && series ? analyze(daily, series) : null), [daily, series]);
  // Ten years of day-by-day scoring: run it just after the page has drawn.
  const [bt, setBt] = useState<Backtest | null>(null);
  useEffect(() => {
    setBt(null);
    if (!daily || !series) return;
    const id = setTimeout(() => setBt(backtest(daily, series)), 50);
    return () => clearTimeout(id);
  }, [daily, series]);
  const tech = useMemo(() => (daily && daily.length ? technicals(daily) : null), [daily]);
  const { stocks } = useMarket();
  const pack = useMemo<StockPack>(() => {
    const balance = balanceSheetFor(symbol);
    const ratios = computeRatios(balance, company, stock);
    const peers = stock
      ? stocks.filter((x) => x.sector === stock.sector && x.symbol !== symbol).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      : [];
    return {
      stock,
      company,
      analysis,
      tech,
      ratios,
      balance,
      peers,
      fair: company ? valueStock({ symbol, stock, company, ratios, balance, peers, daily }) : null,
      today: new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10),
      backtest: bt,
    };
  }, [symbol, stock, company, analysis, tech, stocks, bt, daily]);

  // --- chart extras (daily ranges only) ---
  const dailyRange = range === '1W' || range === '1M' || range === '3M' || range === '1Y';
  // indicator values by candle time, so they line up with whatever bars the chart shows
  const byT = useMemo(() => {
    if (!series) return null;
    const m = new Map<number, number>();
    series.c.forEach((b, i) => m.set(b.t, i));
    return m;
  }, [series]);
  const align = useCallback((vals: (number | null)[]) => bars.map((b) => (byT?.has(b.t) ? vals[byT.get(b.t)!] ?? null : null)), [bars, byT]);
  const maLines = useMemo((): ChartLine[] | undefined => {
    if (!series || !dailyRange) return undefined;
    const out: ChartLine[] = [];
    if (extras.includes('ma'))
      out.push({ values: align(series.e20), color: colors.muted, thin: true }, { values: align(series.e50), color: colors.gold }, { values: align(series.e200), color: colors.shariah });
    if (extras.includes('bb')) out.push({ values: align(series.bbUpper), color: colors.text2, thin: true }, { values: align(series.bbLower), color: colors.text2, thin: true });
    return out.length ? out : undefined;
  }, [series, dailyRange, extras, align]);
  const { feeds } = usePicksFeed();
  const pick = useMemo(() => {
    for (const id of ['all', 'kse100', 'kmi30'] as const) {
      const f = feeds?.[id];
      const p = f?.picks.find((x) => x.symbol === symbol) ?? f?.open.find((x) => x.symbol === symbol);
      if (p) return p;
    }
    return null;
  }, [feeds, symbol]);
  const levelList = useMemo((): ChartLevel[] | undefined => {
    if (!dailyRange) return undefined;
    const out: ChartLevel[] = [];
    if (extras.includes('pick') && pick) {
      const L = pick.levels;
      out.push(
        { price: L.tp2, label: `TP2 ${fmtPrice(L.tp2)}`, color: colors.up },
        { price: L.tp1, label: `TP1 ${fmtPrice(L.tp1)}`, color: colors.up },
        { price: L.entryHigh, label: `Buy zone ${fmtPrice(L.entryLow)}–${fmtPrice(L.entryHigh)}`, color: colors.gold },
        { price: L.entryLow, label: '', color: colors.gold },
        { price: L.stop, label: `Pick stop ${fmtPrice(L.stop)}`, color: colors.downText },
      );
    }
    if (extras.includes('levels') && analysis) {
      if (analysis.resistance) out.push({ price: analysis.resistance.price, label: `Resistance ${fmtPrice(analysis.resistance.price)}`, color: colors.downText });
      if (analysis.support) out.push({ price: analysis.support.price, label: `Support ${fmtPrice(analysis.support.price)}`, color: colors.up });
      if (analysis.stop && !extras.includes('pick')) out.push({ price: analysis.stop, label: `Stop (2 ATR) ${fmtPrice(analysis.stop)}`, color: colors.muted });
    }
    if (extras.includes('w52') && daily?.length) {
      const yr = daily.slice(-248);
      const hi = Math.max(...yr.map((b) => b.h));
      const lo = Math.min(...yr.map((b) => b.l));
      out.push({ price: hi, label: `52-week high ${fmtPrice(hi)}`, color: colors.text2 }, { price: lo, label: `52-week low ${fmtPrice(lo)}`, color: colors.text2 });
    }
    if (extras.includes('fair') && pack.fair) out.push({ price: pack.fair.mid, label: `Fair value ${fmtPrice(pack.fair.mid)}`, color: colors.text2 });
    return out.length ? out.slice(0, 8) : undefined;
  }, [dailyRange, extras, analysis, pack.fair, pick, daily]);
  const fairBand = dailyRange && extras.includes('fair') && pack.fair ? { low: pack.fair.low, high: pack.fair.high, color: colors.up } : null;
  // golden cross (50-day above 200-day) and death cross, over the whole history
  const crosses = useMemo((): ChartMarker[] | undefined => {
    if (!series || !dailyRange || !extras.includes('cross')) return undefined;
    const out: ChartMarker[] = [];
    for (let i = 1; i < series.c.length; i++) {
      const a0 = series.e50[i - 1], b0 = series.e200[i - 1], a1 = series.e50[i], b1 = series.e200[i];
      if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
      if (a0 <= b0 && a1 > b1) out.push({ t: series.c[i].t, kind: 'up' });
      else if (a0 >= b0 && a1 < b1) out.push({ t: series.c[i].t, kind: 'down' });
    }
    return out;
  }, [series, dailyRange, extras]);
  const panesOn = useMemo((): ChartPanes | undefined => {
    if (!series || !dailyRange || (!extras.includes('rsi') && !extras.includes('macd'))) return undefined;
    return {
      rsi: extras.includes('rsi') ? align(series.rsi) : undefined,
      macd: extras.includes('macd') ? { macd: align(series.macd), signal: align(series.signal), hist: align(series.hist) } : undefined,
    };
  }, [series, dailyRange, extras, align]);
  const lastCross = crosses?.length ? crosses[crosses.length - 1] : null;
  // one compact line for whatever is switched on
  const legend: { text: string; color: string }[] = [];
  if (dailyRange) {
    if (extras.includes('ma')) legend.push({ text: '━ 20d', color: colors.muted }, { text: '━ 50d', color: colors.gold }, { text: '━ 200d', color: colors.shariah });
    if (extras.includes('bb')) legend.push({ text: '━ Bollinger', color: colors.text2 });
    if (extras.includes('cross')) legend.push({ text: lastCross ? `▲▼ crosses (last ${lastCross.kind === 'up' ? 'golden' : 'death'} ${fmtDay(lastCross.t).replace(/ \d{4}$/, '')})` : '▲▼ crosses (none)', color: colors.text2 });
    if (extras.includes('fair')) legend.push({ text: pack.fair ? '▒ fair value (rough)' : 'no fair value', color: colors.up });
    if (extras.includes('pick') && pick) legend.push({ text: `pick of ${fmtDay(Date.parse(pick.day + 'T12:00:00Z')).replace(/ \d{4}$/, '')}`, color: colors.gold });
  }

  // --- this stock against the market over the range ---
  useEffect(() => {
    if (stock?.shariah && !kmi) cached<SeriesPoint[]>('eod:KMI30', 30 * 60_000, () => fetchSeries('eod', 'KMI30'), { persist: true }).then(setKmi).catch(() => {});
  }, [stock?.shariah, kmi]);
  const relBars: Partial<Record<Range, number>> = { '1W': 5, '1M': 22, '3M': 63, '1Y': 248 };
  const rel = useMemo(() => {
    const n = relBars[range];
    if (!n || !daily?.length) return null;
    const k = kse ? relativeReturn(daily, kse, n) : null;
    const m = stock?.shariah && kmi ? relativeReturn(daily, kmi, n) : null;
    return k || m ? { k, m } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, daily, kse, kmi, stock?.shariah]);

  const price = stock?.price ?? company?.close ?? null;
  const change = stock?.change ?? company?.change ?? null;
  const changePct = stock?.changePct ?? company?.changePct ?? null;
  const ldcp = stock?.ldcp ?? company?.ldcp ?? null;
  const firstVis = bars[Math.max(0, bars.length - visible)];
  const rangeFrom = bars.length ? (range === '1D' && ldcp ? ldcp : firstVis.o) : null;
  const rangeTo = bars.length ? bars[bars.length - 1].c : null;
  const rangePct = rangeFrom && rangeTo ? ((rangeTo - rangeFrom) / rangeFrom) * 100 : null;
  const pos = account.positions[symbol];
  const watched = isWatched(symbol);
  const news = company?.announcements ?? [];
  const rangeWord: Record<Range, string> = {
    '1D': 'today',
    '1W': 'past week',
    '1M': 'past month',
    '3M': 'past 3 months',
    '1Y': 'past year',
    '5Y': 'past 5 years',
    Max: 'since 2016',
  };

  // Sahm's view in a glance: the chart reading, fair value, and what Sahm says about it if you hold it.
  const { holdings } = useHoldings();
  const held = holdings.find((h) => h.symbol === symbol);
  const view = useMemo(() => {
    const out: { label: string; fg: string; bg: string; tab: Tab }[] = [];
    if (analysis) {
      const st = analysis.stance;
      const up = st === 'Bullish' || st === 'Strong bullish';
      const down = st === 'Bearish' || st === 'Strong bearish';
      out.push({ label: `Chart: ${st}`, fg: up ? colors.up : down ? colors.downText : colors.text2, bg: up ? colors.upSoft : down ? colors.downSoft : colors.surface2, tab: 'technicals' });
    }
    const f = pack.fair;
    if (f?.label) out.push({ label: f.label, fg: f.label === 'Undervalued' ? colors.up : f.label === 'Overvalued' ? colors.downText : colors.text2, bg: f.label === 'Undervalued' ? colors.upSoft : f.label === 'Overvalued' ? colors.downSoft : colors.surface2, tab: 'fundamentals' });
    if (held) out.push({ label: `You hold ${fmtNum(held.shares, 0)}`, fg: colors.gold, bg: colors.goldSoft, tab: 'overview' });
    return out;
  }, [analysis, pack.fair, held]);

  const subline = (
    <T v="caption" style={{ color: changeColor(change), fontSize: 13, marginLeft: 4, lineHeight: 18 }} numberOfLines={2}>
      {fmtSigned(change)} today
      {rangePct != null && range !== '1D' ? (
        <T v="caption" style={{ color: colors.faint, fontSize: 13 }}>
          {'   '}
          <T v="caption" style={{ color: changeColor(rangePct), fontSize: 13 }}>
            {fmtPct(rangePct)}
          </T>{' '}
          {rangeWord[range]}
          {rel?.k ? (
            <T v="caption" style={{ fontSize: 13, color: colors.faint }}>
              {' · '}
              <T v="caption" style={{ fontSize: 13, color: changeColor(rel.k.alpha) }}>
                {fmtPct(rel.k.alpha * 100)}
              </T>{' '}
              vs KSE-100
            </T>
          ) : null}
          {rel?.m ? (
            <T v="caption" style={{ fontSize: 13, color: colors.faint }}>
              {', '}
              <T v="caption" style={{ fontSize: 13, color: changeColor(rel.m.alpha) }}>
                {fmtPct(rel.m.alpha * 100)}
              </T>{' '}
              vs KMI-30
            </T>
          ) : null}
        </T>
      ) : null}
    </T>
  );
  const chartHeader = useCallback(
    (bar: Candle | null) =>
      bar ? (
        <View style={{ marginLeft: 4 }}>
          <Ohlc c={bar} unit={unit} />
        </View>
      ) : (
        subline
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unit, change, rangePct, range],
  );

  const overview = (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 12 }}>
        <View style={{ paddingLeft: space.gutter - 4, paddingRight: 4 }}>
          {loadingChart || bars.length < 2 ? <View style={{ minHeight: 24, marginBottom: 12, justifyContent: 'center' }}>{subline}</View> : null}
          {loadingChart ? (
            <Skeleton kind="chart" height={316} />
          ) : bars.length < 2 ? (
            <View style={{ height: 316, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <T v="body" style={{ color: colors.muted }}>
                {range === '1D' ? 'No trades in this session yet' : 'No chart data'}
              </T>
              <T v="caption">{chartErr ?? (range === '1D' ? 'Try 1W or 1M.' : '')}</T>
            </View>
          ) : (
            <SkiaChart candles={bars} visible={visible} mode={mode} unit={unit} prevClose={range === '1D' ? ldcp : null} header={chartHeader} onScrubChange={setScrubbing} lines={maLines} levels={levelList} band={fairBand} markers={crosses} panes={panesOn} />
          )}
        </View>
        <View style={styles.rangeRow}>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === 'candle' ? 'Show line chart' : 'Show candlestick chart'}
            onPress={() => setMode((m) => (m === 'candle' ? 'line' : 'candle'))}
            style={styles.modeBtn}
          >
            {mode === 'candle' ? <CandleGlyph /> : <Icon name="market" size={18} color={colors.text} />}
          </Pressable>
        </View>
        {dailyRange ? (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.extras}>
              {(
                [
                  ['ma', 'Averages'],
                  ['levels', 'Key levels'],
                  ['fair', 'Fair value'],
                  ...(pick ? ([['pick', 'Pick levels']] as const) : []),
                ] as [Extra, string][]
              ).map(([k, label]) => {
                const on = extras.includes(k);
                return (
                  <Pressable key={k} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggleExtra(k)} style={[styles.extra, on && styles.extraOn]}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: on ? colors.text : colors.faint }}>{label}</T>
                  </Pressable>
                );
              })}
              {(() => {
                const n = extras.filter((e) => MORE_EXTRAS.includes(e)).length;
                return (
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen((v) => !v)} style={[styles.extra, (moreOpen || n > 0) && styles.extraOn]}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: moreOpen || n > 0 ? colors.text : colors.faint }}>
                      More{n ? ` (${n})` : ''} {moreOpen ? '▴' : '▾'}
                    </T>
                  </Pressable>
                );
              })()}
            </ScrollView>
            {moreOpen ? (
              <View style={styles.moreGrid}>
                {(
                  [
                    ['bb', 'Bollinger Bands'],
                    ['w52', '52-week high/low'],
                    ['cross', 'Golden/death cross'],
                    ['rsi', 'RSI'],
                    ['macd', 'MACD'],
                  ] as [Extra, string][]
                ).map(([k, label]) => {
                  const on = extras.includes(k);
                  return (
                    <Pressable key={k} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggleExtra(k)} style={[styles.extra, on && styles.extraOn]}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: on ? colors.text : colors.faint }}>
                        {on ? '✓ ' : ''}
                        {label}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {legend.length ? (
              <T v="caption" style={{ paddingHorizontal: space.gutter, fontSize: 12 }} numberOfLines={2}>
                {legend.map((l, i) => (
                  <T key={i} v="caption" style={{ fontSize: 12, color: l.color }}>
                    {i ? '   ' : ''}
                    {l.text}
                  </T>
                ))}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: space.gutter, gap: space.section }}>
        {pos ? (
          <View style={styles.position}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="caption">Your position</T>
              <T v="mono" style={{ fontSize: 16 }}>
                {fmtNum(pos.qty, 0)} shares at {fmtPrice(pos.avgCost)}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T v="mono" style={{ fontSize: 16 }}>
                {fmtNum((price ?? pos.avgCost) * pos.qty, 0)}
              </T>
              <T v="mono" style={{ fontSize: 13, color: changeColor((price ?? pos.avgCost) - pos.avgCost) }}>
                {fmtSigned(((price ?? pos.avgCost) - pos.avgCost) * pos.qty, 0)}
              </T>
            </View>
          </View>
        ) : null}

        <Section title="Today">
          <Panel style={{ paddingVertical: 16, gap: 16 }}>
            <RangeBar lowLabel="Day low" highLabel="Day high" low={company?.low ?? null} high={company?.high ?? null} value={price} />
            <View style={styles.grid}>
              <Stat label="Open" value={fmtPrice(company?.open)} />
              <Stat label="Prev. close" value={fmtPrice(ldcp)} />
              <Stat label="Volume" value={fmtCompact(stock?.volume ?? company?.volume)} />
              <Stat label="Bid" value={stock?.bid ? `${fmtPrice(stock.bid)}` : '—'} sub={stock?.bidVol ? `${fmtCompact(stock.bidVol)} shares` : undefined} />
              <Stat label="Ask" value={stock?.ask ? `${fmtPrice(stock.ask)}` : '—'} sub={stock?.askVol ? `${fmtCompact(stock.askVol)} shares` : undefined} />
              <Stat label="Value traded" value={price != null && (stock?.volume ?? company?.volume) ? fmtCompact(price * ((stock?.volume ?? company?.volume) as number)) : '—'} />
            </View>
          </Panel>
        </Section>

        <Section title="52-week range">
          <Panel style={{ paddingVertical: 16 }}>
            <RangeBar lowLabel="52-week low" highLabel="52-week high" low={company?.week52Low ?? null} high={company?.week52High ?? null} value={price} />
          </Panel>
        </Section>

        <Section title="Circuit breakers">
          <Panel>
            <KV label="Lower lock" sub="Trading halts below this today" value={fmtPrice(company?.circuitLow)} color={colors.downText} />
            <KV label="Upper lock" sub="Trading halts above this today" value={fmtPrice(company?.circuitHigh)} color={colors.up} last />
          </Panel>
        </Section>

        {tech && analysis ? (
          <Section title="Technical view">
            <Pressable accessibilityRole="button" onPress={() => setTab('technicals')}>
              <Panel style={{ paddingVertical: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ gap: 2 }}>
                    <T v="caption">Signal score</T>
                    <T v="mono" style={{ fontSize: 22 }}>
                      {analysis.score.toFixed(1)}
                      <T v="mono" style={{ fontSize: 14, color: colors.faint }}>
                        /10 · {analysis.stance}
                      </T>
                    </T>
                  </View>
                  <ActionChip action={tech.summary.verdict} />
                </View>
                <T v="caption">
                  {tech.summary.buy} buy, {tech.summary.neutral} neutral, {tech.summary.sell} sell across {tech.oscillators.length + tech.averages.length} indicators
                </T>
                <More label="See all technicals" onPress={() => setTab('technicals')} />
              </Panel>
            </Pressable>
          </Section>
        ) : null}

        {company ? (
          <Section title="Key figures">
            <Panel style={{ paddingVertical: 16, gap: 14 }}>
              <View style={styles.grid}>
                <Stat label="P/E" value={company.pe != null ? fmtNum(company.pe) : '—'} />
                <Stat label="Dividend yield" value={stock?.divYield != null ? fmtPct(stock.divYield, false) : '—'} />
                <Stat label="Market cap" value={fmtCompact(company.marketCap)} />
                <Stat label="1-year" value={fmtPct(company.change1y)} />
                <Stat label="YTD" value={fmtPct(company.ytd)} />
                <Stat label="Free float" value={company.freeFloatPct != null ? fmtPct(company.freeFloatPct, false) : '—'} />
              </View>
              <More label="See fundamentals" onPress={() => setTab('fundamentals')} />
            </Panel>
          </Section>
        ) : null}

        {news.length ? (
          <Section title="Latest announcements" action="See all" onAction={() => setTab('news')}>
            <View>
              {news.slice(0, 3).map((a, i) => (
                <View key={a.date + a.title} style={[styles.news, i < 2 && styles.border]}>
                  <T v="body" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
                    {a.title}
                  </T>
                  <T v="caption">
                    {fmtDay(Date.parse(a.date + 'T12:00:00Z'))}, {a.category.toLowerCase()}
                  </T>
                </View>
              ))}
            </View>
          </Section>
        ) : null}
      </View>
    </View>
  );

  const pad = { paddingHorizontal: space.gutter };
  let content: React.ReactNode;
  if (tab === 'overview')
    content = (
      <View style={{ gap: 26 }}>
        {overview}
        <View style={pad}>
          <Section title="About the company">
            <ProfileTab company={company} err={companyErr} />
          </Section>
        </View>
      </View>
    );
  else if (tab === 'ai') content = <View style={pad}><AiTab symbol={symbol} pack={pack} ready={company != null && daily != null} /></View>;
  else if (tab === 'technicals') content = <View style={pad}><TechnicalsTab symbol={symbol} analysis={analysis} tech={tech} backtest={bt} loading={daily == null} /></View>;
  else if (tab === 'fundamentals')
    content = (
      <View style={[pad, { gap: 26 }]}>
        <FundamentalsTab company={company} stock={stock} err={companyErr} fair={pack.fair} />
        <Section title="Sector peers">
          <PeersTab stock={stock} />
        </Section>
      </View>
    );
  else content = <View style={pad}><NewsTab items={news} loading={!company && !companyErr} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <View style={{ alignItems: 'center' }}>
          <T v="title" style={{ fontSize: 16 }}>
            {symbol}
          </T>
          {price != null ? (
            <T v="mono" style={{ fontSize: 12.5, color: changeColor(changePct) }}>
              {fmtPrice(price)} {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : ''}
            </T>
          ) : null}
        </View>
        <IconButton
          name={watched ? 'starFilled' : 'star'}
          label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          color={watched ? colors.gold : colors.text}
          filled={false}
          onPress={() => toggleWatch(symbol)}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={!scrubbing}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <View style={{ gap: 6, paddingHorizontal: space.gutter, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T v="body" style={{ fontFamily: fonts.semibold, color: colors.text2 }} numberOfLines={1}>
              {company?.name ?? stock?.name ?? symbol}
            </T>
            {stock?.shariah ? <Badge label={stock.indexes.includes('KMI30') ? 'Shariah, KMI-30' : 'Shariah'} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="monoXl" style={{ fontSize: 38 }}>
              {fmtPrice(price)}
            </T>
            <Change pct={changePct} pill />
          </View>
          {view.length ? (
            <View style={styles.viewRow}>
              {view.map((v) => (
                <Pressable key={v.label} accessibilityRole="button" onPress={() => setTab(v.tab)} style={[styles.viewPill, { backgroundColor: v.bg }]}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: v.fg }}>{v.label}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tab !== 'overview' ? subline : null}
        </View>
        <TabStrip tabs={TABS} value={tab} onChange={setTab} />
        <View style={{ paddingTop: 18 }}>{content}</View>
        <T v="caption" style={{ paddingHorizontal: space.gutter, paddingTop: 24 }}>
          Data from the PSX data portal{company?.asOf ? `, ${company.asOf.replace(/^As of /, 'as of ')}` : ''}. Market
          information, not investment advice.
        </T>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Sell" tone="down" style={{ flex: 1 }} onPress={() => nav.navigate('Order', { symbol, side: 'sell' })} />
        <Button label="Buy" tone="up" style={{ flex: 1 }} onPress={() => nav.navigate('Order', { symbol, side: 'buy' })} />
      </View>
    </SafeAreaView>
  );
}

function CandleGlyph() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {[
        [6, 12, colors.up],
        [10, 16, colors.down],
        [4, 10, colors.up],
      ].map(([top, h, c], i) => (
        <View key={i} style={{ alignItems: 'center' }}>
          <View style={{ width: 1, height: 3, backgroundColor: c as string }} />
          <View style={{ width: 4, height: (h as number) - (top as number) + 2, backgroundColor: c as string, borderRadius: 1 }} />
          <View style={{ width: 1, height: 3, backgroundColor: c as string }} />
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  content: { paddingTop: 4, paddingBottom: 28 },
  ohlc: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.gutter },
  extras: { gap: 8, paddingHorizontal: space.gutter },
  extra: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  extraOn: { backgroundColor: colors.surface2, borderColor: colors.line },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: space.gutter },
  viewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  viewPill: { paddingHorizontal: 10, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ranges: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 3 },
  range: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rangeOn: { backgroundColor: colors.line },
  modeBtn: { width: 44, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  position: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  stat: { width: '33.33%', gap: 3 },
  news: { gap: 3, paddingVertical: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.navLine,
    backgroundColor: colors.nav,
  },
}));
