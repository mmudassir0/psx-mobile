import React, { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, changeColor, fonts, space, themed } from '../theme';
import { fmtNum, fmtPkr, fmtSigned, fmtTime, fmtPct } from '../format';
import { INDEX_NAMES } from '../psx/api';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useIndexSeries } from '../store/indexSeries';
import { PicksHomeCard } from '../ui/PicksHomeCard';
import { MarketLine } from '../ui/MarketLine';
import { valuePortfolio } from '../paper/engine';
import { Change, Empty, IconButton, Section, Segmented, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { Sparkline } from '../ui/PriceChart';
import { pkNow } from '../market-hours';
import { UpdateBanner, VersionRow } from '../ui/UpdateBanner';
import { useHoldings } from '../portfolio/holdings';
import { useReviews } from '../portfolio/useReviews';
import { usePicksFeed } from '../picks/feed';
import { appliedBonusesPref } from '../portfolio/prefs';
import { todoItems, usePortfolioTotals } from '../portfolio/summary';
import { Icon } from '../ui/kit';
import { MoodCard, useMood } from '../ui/MoodCard';
import { moodLabel } from '../analysis/mood';
import { updateWidget } from '../widget/update';
import { lastMonth, monthName } from '../portfolio/monthly';
import { EventsCard } from '../ui/EventsCard';
import { WeeklyBriefCard } from '../ui/WeeklyBriefCard';
import { AlertsHomeCard } from '../ui/AlertsHomeCard';
import { useTrackSnapshot } from '../portfolio/track';

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
  const { holdings, loaded: holdingsLoaded } = useHoldings();
  const { feed } = usePicksFeed();
  const { rows, loading: reviewing, candles } = useReviews(holdings, stocks, bySymbol, feed?.breadth ?? null);
  useTrackSnapshot(rows, reviewing);
  const real = usePortfolioTotals(rows, bySymbol);
  const applied = appliedBonusesPref.use();
  const todo = useMemo(() => (reviewing ? [] : todoItems(rows, applied)), [rows, applied, reviewing]);
  const hasReal = holdingsLoaded && holdings.length > 0;
  const { data: mood } = useMood();
  // keep the home screen widget current (only once real prices are in)
  useEffect(() => {
    if (!hasReal || reviewing || !ready || !(real.total > 0)) return;
    updateWidget({ value: real.total, today: real.today, todayPct: real.todayPct, pnlPct: real.pnlPct, mood: mood?.now.score ?? null, moodLabel: mood ? moodLabel(mood.now.score) : null, at: Date.now() });
  }, [hasReal, reviewing, ready, real.total, real.today, real.todayPct, real.pnlPct, mood]);

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
          <IconButton name="settings" label="Settings" onPress={() => nav.navigate('Settings')} />
        </View>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search stocks"
          onPress={() => nav.navigate('Tabs', { screen: 'Market', params: { autoFocusSearch: true } })}
          style={({ pressed }) => [styles.search, pressed && { opacity: 0.8 }]}
        >
          <Icon name="search" size={18} color={colors.muted} />
          <T style={{ color: colors.faint, fontSize: 15 }}>Search symbol or company…</T>
        </Pressable>

        <View style={[styles.pad, { gap: 10 }]}>
          <MarketStatus />
          <MarketLine />
        </View>

        <UpdateBanner />

        {hasReal ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => nav.navigate('Tabs', { screen: 'Portfolio' })}
            style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="label">My portfolio</T>
              <T v="caption">{holdings.length} holdings ›</T>
            </View>
            <T v="monoXl">{fmtPkr(real.total)}</T>
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
              <View style={{ gap: 2 }}>
                <T v="caption">Today</T>
                <T v="mono" style={{ color: changeColor(real.today) }}>
                  {fmtSigned(real.today, 0)} ({fmtPct(real.todayPct * 100)})
                </T>
              </View>
              <View style={{ gap: 2 }}>
                <T v="caption">Total P&L</T>
                <T v="mono" style={{ color: changeColor(real.pnl) }}>
                  {fmtSigned(real.pnl, 0)} ({fmtPct(real.pnlPct * 100)})
                </T>
              </View>
              <View style={{ gap: 2 }}>
                <T v="caption">Invested</T>
                <T v="mono">{fmtNum(real.invested, 0)}</T>
              </View>
            </View>
            {todo.length ? (
              <View style={styles.todo}>
                {todo.map((t) => (
                  <Pressable
                    key={t.key}
                    accessibilityRole="button"
                    hitSlop={4}
                    onPress={() => (t.symbol ? open(t.symbol) : nav.navigate('Tabs', { screen: 'Portfolio' }))}
                    style={styles.todoRow}
                  >
                    <View style={[styles.todoDot, { backgroundColor: t.tone === 'down' ? colors.down : t.tone === 'gold' ? colors.gold : t.tone === 'up' ? colors.up : colors.faint }]} />
                    <T v="body" style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>
                      {t.text}
                    </T>
                    <T v="caption">›</T>
                  </Pressable>
                ))}
              </View>
            ) : reviewing ? (
              <T v="caption">Checking your holdings…</T>
            ) : (
              <T v="caption">Nothing needs your attention today.</T>
            )}
          </Pressable>
        ) : (
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
        )}
        {!hasReal && holdingsLoaded ? (
          <Pressable accessibilityRole="link" onPress={() => nav.navigate('EditHoldings')} style={styles.pad} hitSlop={6}>
            <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Add your real holdings ›</T>
          </Pressable>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.gutter }}>
          {homeIdx.length === 0 && !ready ? <Skeleton kind="chips" n={3} /> : null}
          {homeIdx.map((i) => (
            <Pressable
              key={i.code}
              style={({ pressed }) => [styles.index, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={`${INDEX_NAMES[i.code] ?? i.code} ${fmtNum(i.current)}, ${fmtPct(i.changePct)}`}
              onPress={() => nav.navigate('Index', { code: i.code })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text2 }}>{INDEX_NAMES[i.code] ?? i.code}</T>
                <Change pct={i.changePct} style={{ fontSize: 12.5 }} />
              </View>
              <T v="monoLg">{fmtNum(i.current)}</T>
              <Sparkline values={sparks[i.code] ?? []} width={148} height={34} />
              <T v="caption" style={{ color: changeColor(i.change) }}>
                {fmtSigned(i.change)} pts
              </T>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.pad, { gap: 10 }]}>
          <MoodCard />
          <Pressable accessibilityRole="button" onPress={() => nav.navigate('Dividends')} style={styles.link}>
            <T style={{ fontSize: 18 }}>💸</T>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 14.5 }}>Dividend calendar</T>
              <T v="caption">Upcoming payouts across the PSX, with the last day to buy</T>
            </View>
            <T style={{ color: colors.faint, fontSize: 18 }}>›</T>
          </Pressable>
          {hasReal ? (
            <Pressable accessibilityRole="button" onPress={() => nav.navigate('Summary')} style={styles.link}>
              <T style={{ fontSize: 18 }}>📅</T>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14.5 }}>Monthly summary and goal</T>
                <T v="caption">How {monthName(lastMonth())} went against the KSE-100, and whether you're on course</T>
              </View>
              <T style={{ color: colors.faint, fontSize: 18 }}>›</T>
            </Pressable>
          ) : null}
        </View>

        {hasReal ? <WeeklyBriefCard rows={rows} candles={candles} breadth={feed?.breadth ?? null} ready={!reviewing && ready} /> : null}
        <EventsCard rows={rows} padded />
        <AlertsHomeCard padded />

        <View style={styles.pad}>
          <PicksHomeCard />
        </View>

        <View style={styles.pad}>
          <Section title="Watchlist" action="Find stocks" onAction={() => nav.navigate('Tabs', { screen: 'Market' })}>
            {!ready ? (
              <Skeleton kind="rows" n={5} label="Loading PSX prices" />
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

        <VersionRow />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
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
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.hairline },
  search: { marginHorizontal: space.gutter, marginTop: -8, height: 48, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  todo: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 10, gap: 8 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todoDot: { width: 7, height: 7, borderRadius: 4 },
  error: { backgroundColor: colors.downSoft, borderRadius: 12, padding: 12 },
}));
