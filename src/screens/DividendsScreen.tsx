/** Every upcoming dividend and bonus on the PSX that the daily job found, by book closure date. */
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { calendarItems, isCalendarFeed, type CalendarFeed, type CalendarItem } from '../analysis/calendar';
import { dividendTaxRate, payerKind } from '../analysis/dividends';
import { taxStatusPref } from '../portfolio/prefs';
import { useFeedFile } from '../picks/feed';
import { useMarket } from '../store/market';
import { useHoldings } from '../portfolio/holdings';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Segmented, T } from '../ui/kit';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pk = (t: number) => new Date(t + 5 * 3600_000);
const short = (t: number) => {
  const d = pk(t);
  return `${WD[d.getUTCDay()]} ${fmtDay(t).replace(/ \d{4}$/, '')}`;
};
/** Monday of the PSX week containing t, as a key. */
const weekOf = (t: number) => {
  const d = pk(t);
  const back = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - 5 * 3600_000 + 12 * 3600_000;
};

type Filter = 'all' | 'shariah' | 'mine' | 'high';

export default function DividendsScreen() {
  const nav = useNavigation();
  const { data, loading, error, reload } = useFeedFile<CalendarFeed>('calendar.json', isCalendarFeed);
  const { bySymbol } = useMarket();
  const { holdings } = useHoldings();
  const tax = taxStatusPref.use();
  const [filter, setFilter] = useState<Filter>('all');
  const held = useMemo(() => new Map(holdings.map((h) => [h.symbol, h.shares])), [holdings]);
  const now = Date.now();
  const items = useMemo(() => calendarItems(data, now), [data, now]);
  const shown = items.filter((x) =>
    filter === 'shariah' ? bySymbol.get(x.symbol)?.shariah : filter === 'mine' ? held.has(x.symbol) : filter === 'high' ? (x.yield ?? 0) >= 0.03 : true,
  );
  const thisWeek = weekOf(now);
  const groups = useMemo(() => {
    const m = new Map<number, CalendarItem[]>();
    for (const x of shown) m.set(weekOf(x.bookClosure), [...(m.get(weekOf(x.bookClosure)) ?? []), x]);
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [shown]);
  const weekTitle = (w: number) => (w <= thisWeek ? 'This week' : w - thisWeek < 8 * 864e5 ? 'Next week' : `Week of ${short(w)}`);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Dividend calendar
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <T v="caption" style={{ lineHeight: 18 }}>
          Upcoming dividends and bonus shares across the PSX, by the date the company closes its books. To get one you need to own the
          shares by the end of the "buy by" day.
        </T>
        <Segmented
          options={[
            { key: 'all', label: 'All' },
            { key: 'high', label: '3%+ cash' },
            { key: 'shariah', label: 'Shariah' },
            { key: 'mine', label: 'Mine' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {!data && loading ? (
          <Skeleton kind="rows" n={6} label="Loading the dividend calendar" />
        ) : !data ? (
          <Empty title="No calendar yet" body={error === 'Not published yet' ? 'It appears after the next daily update, around 7 pm on a trading day.' : `Couldn't load it: ${error}`} />
        ) : !shown.length ? (
          <Empty title="Nothing coming up" body={filter === 'all' ? 'No book closures announced right now.' : 'None match this filter. Try All.'} />
        ) : (
          groups.map(([w, list]) => (
            <View key={w} style={{ gap: 8 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text2 }}>{weekTitle(w)}</T>
              <Panel style={{ paddingVertical: 4 }}>
                {list.map((x, i) => {
                  const s = bySymbol.get(x.symbol);
                  const shares = held.get(x.symbol);
                  const late = x.lastBuyDay < now - 12 * 3600_000;
                  const rate = dividendTaxRate(tax, payerKind(s?.sector ?? null));
                  return (
                    <Pressable
                      key={`${x.symbol}${x.bookClosure}`}
                      accessibilityRole="button"
                      onPress={() => nav.navigate('Stock', { symbol: x.symbol })}
                      style={[styles.row, i < list.length - 1 && styles.border, late && { opacity: 0.55 }]}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <T style={{ fontFamily: fonts.heavy, fontSize: 15.5 }}>{x.symbol}</T>
                          {shares ? <T style={{ fontSize: 12, color: colors.gold, fontFamily: fonts.bold }}>you hold</T> : null}
                          {s?.shariah ? <View style={styles.dot} accessibilityLabel="Shariah compliant" /> : null}
                        </View>
                        <T v="caption" style={late ? undefined : { color: colors.text2, fontFamily: fonts.semibold }}>
                          {late ? 'Too late to buy for this one' : `Buy by ${short(x.lastBuyDay)}`}
                        </T>
                        <T v="caption">Books close {short(x.bookClosure)}</T>
                        {shares && x.dps > 0 ? (
                          <T v="caption" style={{ color: colors.up }}>
                            About Rs {fmtNum(x.dps * shares * (1 - rate), 0)} to you after tax
                          </T>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        {x.dps > 0 ? (
                          <T v="mono" style={{ fontSize: 14.5 }}>
                            Rs {x.dps.toFixed(2)}
                          </T>
                        ) : null}
                        <T v="caption" style={{ color: (x.yield ?? 0) >= 0.03 ? colors.up : colors.muted }}>
                          {x.yield != null ? `${(x.yield * 100).toFixed(1)}% of price` : ''}
                          {x.yield != null && x.bonusPct > 0 ? ' + ' : ''}
                          {x.bonusPct > 0 ? `${x.bonusPct}% bonus` : ''}
                        </T>
                      </View>
                    </Pressable>
                  );
                })}
              </Panel>
            </View>
          ))
        )}
        {data ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            From {data.checked} actively traded and index stocks, updated {fmtDay(Date.parse(data.generatedAt))}. Amounts are before tax
            per share; "% of price" is this one payout against the price when it was checked. "Buy by" counts two working days back
            from book closure and doesn't know about market holidays, so check the ex-date in your broker app if it's close. Bonus
            shares lower the price by about the same amount, so they aren't income.
          </T>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.shariah },
  }),
);
