import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, changeColor, fonts, space } from '../theme';
import { fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtPrice, fmtSigned } from '../format';
import { fetchCompany, fetchDailyCandles, fetchSeries } from '../psx/api';
import { groupCandles, ticksToCandles } from '../psx/parse';
import type { Candle, CompanyInfo, SeriesPoint } from '../psx/types';
import { useStock } from '../store/market';
import { useUser } from '../store/user';
import { Badge, Button, Change, Icon, IconButton, Loading, Section, T } from '../ui/kit';
import { Chart, ChartMode } from '../ui/Chart';

type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'Max';
const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'Max'];
const DAY = 86_400_000;

const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** The latest session's ticks only (the intraday feed can include earlier days). */
function lastSession(ticks: SeriesPoint[]): SeriesPoint[] {
  if (!ticks.length) return ticks;
  const dayOf = (t: number) => Math.floor((t + 5 * 3600_000) / DAY);
  const d = dayOf(ticks[ticks.length - 1].t);
  return ticks.filter((p) => dayOf(p.t) === d);
}

function barsFor(range: Range, daily: Candle[], intraday: Candle[]): { bars: Candle[]; unit: 'intraday' | 'day' | 'week' | 'month' } {
  if (range === '1D') return { bars: intraday, unit: 'intraday' };
  if (!daily.length) return { bars: [], unit: 'day' };
  const lastT = daily[daily.length - 1].t;
  const since = (days: number) => daily.filter((c) => c.t > lastT - days * DAY);
  switch (range) {
    case '1W':
      return { bars: since(7), unit: 'day' };
    case '1M':
      return { bars: since(31), unit: 'day' };
    case '3M':
      return { bars: since(92), unit: 'day' };
    case '1Y':
      return { bars: since(366), unit: 'day' };
    case '5Y':
      return { bars: groupCandles(since(5 * 366), 'week'), unit: 'week' };
    default:
      return { bars: groupCandles(daily, 'month'), unit: 'month' };
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 14 }}>
        {value}
      </T>
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

export default function StockScreen() {
  const nav = useNavigation();
  const { symbol } = useRoute<RouteProp<RootParams, 'Stock'>>().params;
  const stock = useStock(symbol);
  const { isWatched, toggleWatch, account } = useUser();
  const [range, setRange] = useState<Range>('1M');
  const [mode, setMode] = useState<ChartMode>('candle');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyErr, setCompanyErr] = useState<string | null>(null);
  const [daily, setDaily] = useState<Candle[] | null>(null);
  const [ticks, setTicks] = useState<SeriesPoint[] | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCompany(symbol)
      .then((c) => alive && setCompany(c))
      .catch((e) => alive && setCompanyErr((e as Error).message));
    cached(`daily:${symbol}`, 30 * 60_000, () => fetchDailyCandles(symbol))
      .then((d) => alive && setDaily(d))
      .catch((e) => {
        if (!alive) return;
        setDaily([]);
        setChartErr((e as Error).message);
      });
    cached(`int:${symbol}`, 60_000, () => fetchSeries('int', symbol))
      .then((d) => alive && setTicks(d))
      .catch(() => alive && setTicks([]));
    return () => {
      alive = false;
    };
  }, [symbol]);

  const intradayBars = useMemo(() => ticksToCandles(lastSession(ticks ?? []), 5), [ticks]);
  const { bars, unit } = useMemo(() => barsFor(range, daily ?? [], intradayBars), [range, daily, intradayBars]);
  const loadingChart = range === '1D' ? ticks == null : daily == null;

  const price = stock?.price ?? company?.close ?? null;
  const change = stock?.change ?? company?.change ?? null;
  const changePct = stock?.changePct ?? company?.changePct ?? null;
  const ldcp = stock?.ldcp ?? company?.ldcp ?? null;
  const rangeFrom = bars.length ? (range === '1D' && ldcp ? ldcp : bars[0].o) : null;
  const rangeTo = bars.length ? bars[bars.length - 1].c : null;
  const rangePct = rangeFrom && rangeTo ? ((rangeTo - rangeFrom) / rangeFrom) * 100 : null;
  const pos = account.positions[symbol];
  const watched = isWatched(symbol);

  const news = company?.announcements ?? [];
  const shownNews = showAllNews ? news.slice(0, 20) : news.slice(0, 4);
  const rangeWord: Record<Range, string> = {
    '1D': 'today',
    '1W': 'past week',
    '1M': 'past month',
    '3M': 'past 3 months',
    '1Y': 'past year',
    '5Y': 'past 5 years',
    Max: 'since 2016',
  };

  const subline = (
    <T v="caption" style={{ color: changeColor(change), fontSize: 13, marginLeft: 4 }} numberOfLines={1}>
      {fmtSigned(change)} today
      {rangePct != null && range !== '1D' ? (
        <T v="caption" style={{ color: colors.faint, fontSize: 13 }}>
          {'   '}
          <T v="caption" style={{ color: changeColor(rangePct), fontSize: 13 }}>
            {fmtPct(rangePct)}
          </T>{' '}
          {rangeWord[range]}
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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          {symbol}
        </T>
        <IconButton
          name={watched ? 'starFilled' : 'star'}
          label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          color={watched ? colors.gold : colors.text}
          filled={false}
          onPress={() => toggleWatch(symbol)}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!scrubbing}>
        <View style={{ gap: 6, paddingHorizontal: space.gutter }}>
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
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ paddingLeft: space.gutter - 4, paddingRight: 4 }}>
            {loadingChart || bars.length < 2 ? <View style={{ minHeight: 24, marginBottom: 12, justifyContent: 'center' }}>{subline}</View> : null}
            {loadingChart ? (
              <View style={{ height: 316, justifyContent: 'center' }}>
                <Loading />
              </View>
            ) : bars.length < 2 ? (
              <View style={{ height: 316, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                <T v="body" style={{ color: colors.muted }}>
                  {range === '1D' ? 'No trades in this session yet' : 'No chart data'}
                </T>
                <T v="caption">{chartErr ?? (range === '1D' ? 'Try 1W or 1M.' : '')}</T>
              </View>
            ) : (
              <Chart candles={bars} mode={mode} unit={unit} prevClose={range === '1D' ? ldcp : null} header={chartHeader} onScrubChange={setScrubbing} />
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

          <Section title="Key figures">
            {company ? (
              <View style={styles.grid}>
                <Stat label="Open" value={fmtPrice(company.open)} />
                <Stat label="Day high" value={fmtPrice(company.high)} />
                <Stat label="Day low" value={fmtPrice(company.low)} />
                <Stat label="Volume" value={fmtCompact(stock?.volume ?? company.volume)} />
                <Stat label="Prev. close" value={fmtPrice(ldcp)} />
                <Stat label="P/E" value={company.pe != null ? fmtNum(company.pe) : '—'} />
                <Stat label="52-week low" value={fmtPrice(company.week52Low)} />
                <Stat label="52-week high" value={fmtPrice(company.week52High)} />
                <Stat label="Dividend yield" value={stock?.divYield != null ? fmtPct(stock.divYield, false) : '—'} />
                <Stat label="Market cap" value={fmtCompact(company.marketCap)} />
                <Stat label="1-year change" value={fmtPct(company.change1y)} />
                <Stat label="Free float" value={company.freeFloatPct != null ? fmtPct(company.freeFloatPct, false) : '—'} />
              </View>
            ) : companyErr ? (
              <T v="caption">Couldn't load company data: {companyErr}</T>
            ) : (
              <Loading />
            )}
          </Section>

          {company?.description ? (
            <Section title="About">
              <Pressable accessibilityRole="button" onPress={() => setAboutOpen((v) => !v)} style={{ gap: 6 }}>
                <T v="body" style={{ color: colors.text2 }} numberOfLines={aboutOpen ? undefined : 3}>
                  {company.description}
                </T>
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{aboutOpen ? 'Show less' : 'Read more'}</T>
              </Pressable>
            </Section>
          ) : null}

          {news.length ? (
            <Section
              title="Announcements"
              action={news.length > 4 ? (showAllNews ? 'Show fewer' : 'Show all') : undefined}
              onAction={() => setShowAllNews((v) => !v)}
            >
              <View>
                {shownNews.map((a, i) => (
                  <Pressable
                    key={a.date + a.title}
                    accessibilityRole={a.url ? 'link' : undefined}
                    onPress={a.url ? () => Linking.openURL(a.url!) : undefined}
                    style={[styles.news, i < shownNews.length - 1 && styles.border]}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                        {a.title}
                      </T>
                      <T v="caption">
                        {fmtDay(Date.parse(a.date + 'T12:00:00Z'))}, {a.category.toLowerCase()}
                      </T>
                    </View>
                    {a.url ? <Icon name="doc" size={18} color={colors.faint} /> : null}
                  </Pressable>
                ))}
              </View>
            </Section>
          ) : null}
          <T v="caption">
            Data from the PSX data portal{company?.asOf ? `, ${company.asOf.replace(/^As of /, 'as of ')}` : ''}. Market
            information, not investment advice.
          </T>
        </View>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  content: { paddingTop: 4, paddingBottom: 28, gap: 22 },
  ohlc: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.gutter },
  ranges: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 3 },
  range: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rangeOn: { backgroundColor: colors.line },
  modeBtn: { width: 44, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  position: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  stat: { width: '33.33%', gap: 3 },
  news: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
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
});
