import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, changeColor, fonts, space } from '../theme';
import { fmtNum, fmtPkr, fmtSigned, fmtTime, fmtPct } from '../format';
import { INDEX_NAMES } from '../psx/api';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useIndexSeries } from '../store/indexSeries';
import { valuePortfolio } from '../paper/engine';
import { Change, Empty, IconButton, Loading, Section, Segmented, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { Sparkline } from '../ui/PriceChart';
import { pkNow } from '../market-hours';

const HOME_INDICES = ['KSE100', 'KMI30', 'KSE30', 'ALLSHR'];

function greeting() {
  const h = Math.floor(pkNow().minutes / 60);
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function MarketStatus() {
  const { marketOpen, updatedAt, error, refreshing } = useMarket();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.dot, { backgroundColor: marketOpen ? colors.up : colors.faint }]} />
        <T v="caption" style={{ color: marketOpen ? colors.up : colors.muted }}>
          {marketOpen ? 'Market open' : 'Market closed'}
          {updatedAt ? `, prices from ${fmtTime(updatedAt)}` : ''}
          {refreshing ? ', refreshing' : ''}
        </T>
      </View>
      {error ? (
        <View style={styles.error}>
          <T v="caption" style={{ color: colors.downText }}>
            {error}. Showing the last prices we had; pull down to retry.
          </T>
        </View>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const nav = useNavigation();
  const { ready, indices, stocks, bySymbol, refresh, refreshing } = useMarket();
  const { name, watchlist, account } = useUser();
  const [movers, setMovers] = useState<'gainers' | 'losers' | 'active'>('gainers');
  const sparks = useIndexSeries(HOME_INDICES);

  const val = valuePortfolio(account, (s) => bySymbol.get(s));
  const homeIdx = HOME_INDICES.map((c) => indices.find((i) => i.code === c)).filter(Boolean) as typeof indices;

  const moverList = useMemo(() => {
    if (movers === 'active') return [...stocks].filter((s) => (s.volume ?? 0) > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
    const liquid = stocks.filter((s) => s.changePct != null && (s.volume ?? 0) >= 100_000);
    const sorted = [...liquid].sort((a, b) => (b.changePct as number) - (a.changePct as number));
    return movers === 'gainers' ? sorted.slice(0, 5) : sorted.reverse().slice(0, 5);
  }, [stocks, movers]);

  const watched = watchlist.map((s) => bySymbol.get(s)).filter(Boolean) as typeof stocks;
  const open = (symbol: string) => nav.navigate('Stock', { symbol });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />
        }
      >
        <View style={[styles.header, styles.pad]}>
          <View style={{ gap: 2, flex: 1 }}>
            <T v="caption" style={{ fontSize: 14 }}>
              {greeting()}
            </T>
            <T v="h1" numberOfLines={1}>
              {name || 'Investor'}
            </T>
          </View>
          <IconButton name="search" label="Search stocks" onPress={() => nav.navigate('Tabs', { screen: 'Market' })} />
        </View>

        <View style={styles.pad}>
          <MarketStatus />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.gutter }}>
          {homeIdx.length === 0 && !ready ? <Loading /> : null}
          {homeIdx.map((i) => (
            <View key={i.code} style={styles.index} accessible accessibilityLabel={`${INDEX_NAMES[i.code] ?? i.code} ${fmtNum(i.current)}, ${fmtPct(i.changePct)}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text2 }}>{INDEX_NAMES[i.code] ?? i.code}</T>
                <Change pct={i.changePct} style={{ fontSize: 12.5 }} />
              </View>
              <T v="monoLg">{fmtNum(i.current)}</T>
              <Sparkline values={sparks[i.code] ?? []} width={148} height={34} />
              <T v="caption" style={{ color: changeColor(i.change) }}>
                {fmtSigned(i.change)} pts
              </T>
            </View>
          ))}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('Tabs', { screen: 'Portfolio' })}
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T v="label">Paper account</T>
            <T v="caption">Practice money</T>
          </View>
          <T v="monoXl">{fmtPkr(val.total)}</T>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <View style={{ gap: 2 }}>
              <T v="caption">Today</T>
              <T v="mono" style={{ color: changeColor(val.dayChange) }}>
                {fmtSigned(val.dayChange, 0)}
              </T>
            </View>
            <View style={{ gap: 2 }}>
              <T v="caption">Total return</T>
              <T v="mono" style={{ color: changeColor(val.totalReturn) }}>
                {fmtPct(val.totalReturnPct)}
              </T>
            </View>
            <View style={{ gap: 2 }}>
              <T v="caption">Cash</T>
              <T v="mono">{fmtNum(account.cash, 0)}</T>
            </View>
          </View>
        </Pressable>

        <View style={styles.pad}>
          <Section title="Watchlist" action="Find stocks" onAction={() => nav.navigate('Tabs', { screen: 'Market' })}>
            {!ready ? (
              <Loading label="Loading PSX prices" />
            ) : watched.length === 0 ? (
              <Empty title="Nothing on your watchlist" body="Open any stock and tap the star to follow it here." />
            ) : (
              <View>
                {watched.map((s, i) => (
                  <StockRow key={s.symbol} stock={s} last={i === watched.length - 1} onPress={() => open(s.symbol)} />
                ))}
              </View>
            )}
          </Section>
        </View>

        <View style={styles.pad}>
          <Section title="Movers today">
            <Segmented
              options={[
                { key: 'gainers', label: 'Gainers' },
                { key: 'losers', label: 'Losers' },
                { key: 'active', label: 'Most traded' },
              ]}
              value={movers}
              onChange={setMovers}
            />
            <View>
              {moverList.map((s, i) => (
                <StockRow key={s.symbol} stock={s} sub={volumeLabel(s)} last={i === moverList.length - 1} onPress={() => open(s.symbol)} />
              ))}
              {ready && moverList.length === 0 ? <Empty title="No movers yet" body="They appear once trading starts." /> : null}
            </View>
            {movers !== 'active' ? <T v="caption">Only stocks with at least 100,000 shares traded today.</T> : null}
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingTop: 8, paddingBottom: 36, gap: 22 },
  pad: { paddingHorizontal: space.gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  index: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 6, width: 176 },
  hero: {
    marginHorizontal: space.gutter,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  error: { backgroundColor: colors.downSoft, borderRadius: 12, padding: 12 },
});
