import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, changeColor } from '../theme';
import { fmtNum, fmtPkr, fmtSigned, fmtTime, fmtPct } from '../format';
import { INDEX_NAMES } from '../psx/api';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { valuePortfolio } from '../paper/engine';
import { Badge, Card, Change, Empty, IconButton, Loading, Segmented, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { pkNow } from '../market-hours';

const HOME_INDICES = ['KSE100', 'KMI30', 'KSE30', 'ALLSHR', 'KMIALLSHR'];

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
          {updatedAt ? ` · updated ${fmtTime(updatedAt)}` : ''}
          {refreshing ? ' · refreshing…' : ''}
        </T>
      </View>
      {error ? (
        <View style={styles.error}>
          <T v="caption" style={{ color: colors.downText }}>
            {error}. Showing the last prices we had.
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
  const [movers, setMovers] = useState<'gainers' | 'losers'>('gainers');

  const val = valuePortfolio(account, (s) => bySymbol.get(s));
  const homeIdx = HOME_INDICES.map((c) => indices.find((i) => i.code === c)).filter(Boolean) as typeof indices;

  const moverList = useMemo(() => {
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <View style={styles.header}>
          <View style={{ gap: 2 }}>
            <T v="caption">{greeting()}</T>
            <T v="h1" style={{ fontSize: 20 }}>
              {name || 'Investor'}
            </T>
          </View>
          <IconButton name="search" label="Search stocks" onPress={() => nav.navigate('Tabs', { screen: 'Market' })} />
        </View>

        <MarketStatus />

        <Pressable accessibilityRole="button" onPress={() => nav.navigate('Tabs', { screen: 'Portfolio' })}>
          <Card style={{ gap: 6 }}>
            <View style={styles.between}>
              <T v="caption" style={{ color: colors.muted }}>
                Portfolio value
              </T>
              <Badge label="PAPER" tone="gold" />
            </View>
            <T v="monoXl">{fmtPkr(val.total)}</T>
            <T v="mono" style={{ color: changeColor(val.dayChange) }}>
              {val.dayChange === 0 ? 'No change today' : `${fmtSigned(val.dayChange, 0)} today`}
            </T>
            <T v="caption">
              Total return {fmtSigned(val.totalReturn, 0)} ({fmtPct(val.totalReturnPct)}) · Cash {fmtNum(account.cash, 0)}
            </T>
          </Card>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {homeIdx.length === 0 && !ready ? <Loading /> : null}
          {homeIdx.map((i) => (
            <View key={i.code} style={styles.index} accessible accessibilityLabel={`${INDEX_NAMES[i.code] ?? i.code} ${fmtNum(i.current)}`}>
              <T v="label">{INDEX_NAMES[i.code] ?? i.code}</T>
              <T v="mono" style={{ fontSize: 15 }}>
                {fmtNum(i.current)}
              </T>
              <Change pct={i.changePct} />
            </View>
          ))}
        </ScrollView>

        <View style={{ gap: 4 }}>
          <View style={styles.between}>
            <T v="title">Watchlist</T>
            <T v="caption">Tap ☆ on any stock to add</T>
          </View>
          {!ready ? (
            <Loading label="Loading PSX prices…" />
          ) : watched.length === 0 ? (
            <Empty title="Your watchlist is empty" body="Open any stock and tap the star to follow it here." />
          ) : (
            watched.map((s, i) => <StockRow key={s.symbol} stock={s} last={i === watched.length - 1} onPress={() => open(s.symbol)} />)
          )}
        </View>

        <View style={{ gap: 10 }}>
          <T v="title">Top movers</T>
          <Segmented
            options={[
              { key: 'gainers', label: 'Gainers' },
              { key: 'losers', label: 'Losers' },
            ]}
            value={movers}
            onChange={setMovers}
          />
          <View>
            {moverList.map((s, i) => (
              <StockRow key={s.symbol} stock={s} sub={volumeLabel(s)} last={i === moverList.length - 1} onPress={() => open(s.symbol)} />
            ))}
            {ready && moverList.length === 0 ? <Empty title="No movers yet" body="Movers appear once trading starts." /> : null}
          </View>
          <T v="caption">Stocks with at least 100K shares traded today.</T>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 16, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  index: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4, minWidth: 120 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  error: { backgroundColor: colors.downSoft, borderRadius: 10, padding: 10 },
});
