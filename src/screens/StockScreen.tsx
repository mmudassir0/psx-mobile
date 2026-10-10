import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, changeColor } from '../theme';
import { fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtPrice, fmtSigned } from '../format';
import { fetchCompany, fetchSeries } from '../psx/api';
import type { CompanyInfo, SeriesPoint } from '../psx/types';
import { useStock } from '../store/market';
import { useUser } from '../store/user';
import { Badge, Button, Card, Icon, IconButton, Loading, T } from '../ui/kit';
import { PriceChart } from '../ui/PriceChart';

type Range = '1D' | '1M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';
const RANGES: Range[] = ['1D', '1M', '6M', 'YTD', '1Y', '3Y', '5Y'];

const seriesCache = new Map<string, { at: number; data: SeriesPoint[] }>();
async function getSeries(kind: 'eod' | 'int', symbol: string) {
  const key = `${kind}:${symbol}`;
  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.at < (kind === 'int' ? 60_000 : 30 * 60_000)) return hit.data;
  const data = await fetchSeries(kind, symbol);
  seriesCache.set(key, { at: Date.now(), data });
  return data;
}

function sliceRange(eod: SeriesPoint[], r: Range): SeriesPoint[] {
  if (!eod.length) return eod;
  const lastT = eod[eod.length - 1].t;
  const day = 86_400_000;
  let from: number;
  if (r === 'YTD') {
    const d = new Date(lastT + 5 * 3600_000);
    from = Date.UTC(d.getUTCFullYear(), 0, 1) - 5 * 3600_000;
  } else {
    const days = { '1M': 31, '6M': 183, '1Y': 366, '3Y': 3 * 366, '5Y': 5 * 366, '1D': 1 }[r];
    from = lastT - days * day;
  }
  return eod.filter((p) => p.t >= from);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 13 }}>
        {value}
      </T>
    </View>
  );
}

export default function StockScreen() {
  const nav = useNavigation();
  const { symbol } = useRoute<RouteProp<RootParams, 'Stock'>>().params;
  const stock = useStock(symbol);
  const { isWatched, toggleWatch, account } = useUser();
  const [range, setRange] = useState<Range>('1D');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyErr, setCompanyErr] = useState<string | null>(null);
  const [eod, setEod] = useState<SeriesPoint[] | null>(null);
  const [intra, setIntra] = useState<SeriesPoint[] | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const [showAllNews, setShowAllNews] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCompany(symbol)
      .then((c) => alive && setCompany(c))
      .catch((e) => alive && setCompanyErr((e as Error).message));
    getSeries('int', symbol)
      .then((d) => alive && setIntra(d))
      .catch((e) => alive && setChartErr((e as Error).message));
    getSeries('eod', symbol)
      .then((d) => alive && setEod(d))
      .catch((e) => alive && setChartErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [symbol]);

  // Intraday series holds only the latest session; keep its last day.
  const today = useMemo(() => {
    if (!intra?.length) return [];
    const lastDay = Math.floor((intra[intra.length - 1].t + 5 * 3600_000) / 86_400_000);
    return intra.filter((p) => Math.floor((p.t + 5 * 3600_000) / 86_400_000) === lastDay);
  }, [intra]);

  const points = useMemo(() => {
    if (range === '1D') return today;
    return eod ? sliceRange(eod, range) : [];
  }, [range, today, eod]);

  const loadingChart = range === '1D' ? intra == null : eod == null;

  const price = stock?.price ?? company?.close ?? null;
  const change = stock?.change ?? company?.change ?? null;
  const changePct = stock?.changePct ?? company?.changePct ?? null;
  const rangeChange = points.length > 1 ? points[points.length - 1].v - points[0].v : null;
  const rangePct = points.length > 1 && points[0].v ? (rangeChange! / points[0].v) * 100 : null;
  const pos = account.positions[symbol];
  const watched = isWatched(symbol);
  const ldcp = stock?.ldcp ?? company?.ldcp ?? null;

  const onScrub = useCallback((p: SeriesPoint | null) => setScrub(p), []);

  const news = company?.announcements ?? [];
  const shownNews = showAllNews ? news.slice(0, 20) : news.slice(0, 5);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <IconButton
          name={watched ? 'starFilled' : 'star'}
          label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          color={watched ? colors.gold : colors.text}
          onPress={() => toggleWatch(symbol)}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="h1">{symbol}</T>
            {stock?.shariah ? <Badge label={stock.indexes.includes('KMI30') ? 'SHARIAH · KMI-30' : 'SHARIAH'} /> : null}
          </View>
          <T v="caption" style={{ fontSize: 13 }}>
            {company?.name ?? stock?.name ?? ''}
            {stock?.sector ? ` · ${stock.sector}` : ''}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <T v="monoXl">{fmtPrice(scrub ? scrub.v : price)}</T>
            {scrub ? (
              <T v="caption">{range === '1D' ? fmtDateTime(scrub.t) : fmtDay(scrub.t)}</T>
            ) : (
              <T v="mono" style={{ color: changeColor(change) }}>
                {fmtSigned(change)} ({fmtPct(changePct)})
              </T>
            )}
          </View>
          {range !== '1D' && rangePct != null && !scrub ? (
            <T v="caption" style={{ color: changeColor(rangePct) }}>
              {fmtPct(rangePct)} over {range === 'YTD' ? 'this year' : range}
            </T>
          ) : null}
        </View>

        <Card style={{ padding: 12, gap: 10 }}>
          {loadingChart ? (
            <View style={{ height: 200, justifyContent: 'center' }}>
              <Loading />
            </View>
          ) : chartErr && points.length < 2 ? (
            <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
              <T v="caption">Chart unavailable: {chartErr}</T>
            </View>
          ) : (
            <PriceChart points={points} intraday={range === '1D'} baseline={range === '1D' ? ldcp : null} onScrub={onScrub} />
          )}
          <View style={styles.ranges} accessibilityRole="tablist">
            {RANGES.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="tab"
                accessibilityState={{ selected: r === range }}
                onPress={() => setRange(r)}
                style={[styles.range, r === range && { backgroundColor: colors.line }]}
              >
                <T v="mono" style={{ fontSize: 12, color: r === range ? colors.text : colors.faint }}>
                  {r}
                </T>
              </Pressable>
            ))}
          </View>
          {range === '1D' && !loadingChart && today.length < 2 ? (
            <T v="caption">No trades yet in this session. Try 1M.</T>
          ) : null}
        </Card>

        {pos ? (
          <Card style={{ gap: 8 }}>
            <T v="title" style={{ fontSize: 15 }}>
              Your position (paper)
            </T>
            <View style={styles.grid}>
              <Stat label="Shares" value={fmtNum(pos.qty, 0)} />
              <Stat label="Avg cost" value={fmtPrice(pos.avgCost)} />
              <Stat label="Value" value={fmtNum((price ?? pos.avgCost) * pos.qty, 0)} />
            </View>
            <T v="mono" style={{ color: changeColor(((price ?? pos.avgCost) - pos.avgCost) * pos.qty) }}>
              P&L {fmtSigned(((price ?? pos.avgCost) - pos.avgCost) * pos.qty, 0)} ({fmtPct(price ? ((price - pos.avgCost) / pos.avgCost) * 100 : 0)})
            </T>
          </Card>
        ) : null}

        <View style={{ gap: 10 }}>
          <T v="title">Key figures</T>
          {company ? (
            <View style={styles.grid}>
              <Stat label="Open" value={fmtPrice(company.open)} />
              <Stat label="High" value={fmtPrice(company.high)} />
              <Stat label="Low" value={fmtPrice(company.low)} />
              <Stat label="Volume" value={fmtCompact(stock?.volume ?? company.volume)} />
              <Stat label="Prev. close" value={fmtPrice(ldcp)} />
              <Stat label="P/E (TTM)" value={company.pe != null ? fmtNum(company.pe) : '—'} />
              <Stat label="52-wk low" value={fmtPrice(company.week52Low)} />
              <Stat label="52-wk high" value={fmtPrice(company.week52High)} />
              <Stat label="Div. yield" value={stock?.divYield != null ? fmtPct(stock.divYield, false) : '—'} />
              <Stat label="Market cap" value={fmtCompact(company.marketCap)} />
              <Stat label="1-yr change" value={fmtPct(company.change1y)} />
              <Stat label="Free float" value={company.freeFloatPct != null ? fmtPct(company.freeFloatPct, false) : '—'} />
            </View>
          ) : companyErr ? (
            <T v="caption">Couldn't load company data: {companyErr}</T>
          ) : (
            <Loading />
          )}
          {company?.asOf ? <T v="caption">PSX data {company.asOf.replace(/^As of /, 'as of ')}</T> : null}
        </View>

        {company?.description ? (
          <Pressable accessibilityRole="button" onPress={() => setAboutOpen((v) => !v)} style={{ gap: 6 }}>
            <T v="title">About</T>
            <T v="body" style={{ color: colors.text2 }} numberOfLines={aboutOpen ? undefined : 3}>
              {company.description}
            </T>
            <T v="caption" style={{ color: colors.gold }}>
              {aboutOpen ? 'Show less' : 'Read more'}
            </T>
          </Pressable>
        ) : null}

        {news.length ? (
          <View style={{ gap: 4 }}>
            <T v="title">Announcements</T>
            {shownNews.map((a, i) => (
              <Pressable
                key={a.date + a.title}
                accessibilityRole={a.url ? 'link' : undefined}
                onPress={a.url ? () => Linking.openURL(a.url!) : undefined}
                style={[styles.news, i < shownNews.length - 1 && styles.border]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="body" style={{ fontSize: 13, lineHeight: 19 }}>
                    {a.title}
                  </T>
                  <T v="caption">
                    {fmtDay(Date.parse(a.date + 'T12:00:00Z'))} · {a.category}
                  </T>
                </View>
                {a.url ? <Icon name="doc" size={18} color={colors.faint} /> : null}
              </Pressable>
            ))}
            {news.length > 5 ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAllNews((v) => !v)} style={{ paddingVertical: 8 }}>
                <T v="caption" style={{ color: colors.gold }}>
                  {showAllNews ? 'Show fewer' : `Show more (${Math.min(20, news.length)})`}
                </T>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <T v="caption" style={{ lineHeight: 18 }}>
          Source: PSX data portal. Market information, not investment advice.
        </T>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Sell" tone="down" style={{ flex: 1 }} onPress={() => nav.navigate('Order', { symbol, side: 'sell' })} />
        <Button label="Buy" tone="up" style={{ flex: 1 }} onPress={() => nav.navigate('Order', { symbol, side: 'buy' })} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 },
  content: { padding: 16, paddingTop: 4, paddingBottom: 24, gap: 18 },
  ranges: { flexDirection: 'row', gap: 4 },
  range: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  stat: { width: '33.33%', gap: 2 },
  news: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.surface2 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.navLine,
    backgroundColor: colors.nav,
  },
});

