/** Swipe stories: today's check as a deck of cards: your money, what needs a look, news, the market, done. */
import React, { useState } from 'react';
import { useFlags } from '../flags';
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtNum, fmtPct, fmtPkr, fmtSigned } from '../format';
import { moodLabel } from '../analysis/mood';
import type { TodoItem } from '../portfolio/summary';
import type { Row } from '../portfolio/useReviews';
import { useMarket } from '../store/market';
import { moodColor, useMood } from './MoodCard';
import { ago, useNews } from './NewsList';
import { useTodayItems } from './TodayList';
import { eventsFor } from './EventsCard';
import { T } from './kit';
import { ToolIcon } from './ToolIcon';

export function StoryDeck({ rows, todo, totals, hasReal }: { rows: Row[]; todo: TodoItem[]; totals: { total: number; today: number; todayPct: number; pnl: number; pnlPct: number; invested: number }; hasReal: boolean }) {
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const w = width - space.gutter * 2;
  const [page, setPage] = useState(0);
  const items = useTodayItems(rows, todo, 5);
  const { items: news } = useNews();
  const on = useFlags();
  const { data: moodData } = useMood();
  const mood = on('mood') ? moodData : null;
  const { indices } = useMarket();
  const kse = indices.find((i) => i.code === 'KSE100');
  const held = new Set(rows.map((r) => r.holding.symbol));
  const mine = news.filter((n) => n.symbols.some((s) => held.has(s)));
  const headlines = (mine.length ? mine : news.filter((n) => n.market)).slice(0, 3);
  const next = on('comingUp') ? eventsFor(rows, Date.now(), 14)[0] : undefined;

  const all: (React.ReactNode | null)[] = [
    <View key="money" style={{ gap: 14 }}>
      <T v="label">Your money</T>
      {hasReal ? (
        <>
          <T v="monoXl" style={{ fontSize: 36 }}>
            {fmtPkr(totals.total)}
          </T>
          <T v="mono" style={{ fontSize: 17, color: changeColor(totals.today) }}>
            Today {fmtSigned(totals.today, 0)} ({fmtPct(totals.todayPct * 100)})
          </T>
          <T v="mono" style={{ fontSize: 15, color: changeColor(totals.pnl) }}>
            Overall {fmtSigned(totals.pnl, 0)} ({fmtPct(totals.pnlPct * 100)}) on {fmtNum(totals.invested, 0)}
          </T>
        </>
      ) : (
        <T v="body" style={{ fontSize: 15 }}>
          Add your holdings to see your money here each morning.
        </T>
      )}
      <Pressable accessibilityRole="button" onPress={() => (hasReal ? nav.navigate('Tabs', { screen: 'Portfolio' }) : nav.navigate('EditHoldings'))}>
        <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>{hasReal ? 'Open portfolio ›' : 'Add holdings ›'}</T>
      </Pressable>
    </View>,
    <View key="today" style={{ gap: 10 }}>
      <T v="label">Needs a look</T>
      {items.length ? (
        items.map((it) => (
          <Pressable key={it.key} accessibilityRole="button" onPress={it.onPress} style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 20, paddingTop: 2, alignItems: 'center' }}>
              <ToolIcon name={it.glyph} size={it.glyph === 'dot' ? 11 : 17} color={it.ink ?? colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 20 }} numberOfLines={2}>
                {it.text}
              </T>
              {it.sub ? <T v="caption">{it.sub}</T> : null}
            </View>
          </Pressable>
        ))
      ) : (
        <T v="body" style={{ fontSize: 15 }}>
          Nothing today. Enjoy your day.
        </T>
      )}
    </View>,
    !on('news') ? null : (
      <View key="news" style={{ gap: 12 }}>
        <T v="label">{mine.length ? 'In the news: your stocks' : 'In the news'}</T>
        {headlines.length ? (
          headlines.map((n) => (
            <Pressable key={n.url} accessibilityRole="link" onPress={() => Linking.openURL(n.url).catch(() => {})} style={{ gap: 2 }}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 }}>{n.title}</T>
              <T v="caption">
                {n.source} · {ago(n.t)}
              </T>
            </Pressable>
          ))
        ) : (
          <T v="body">No headlines yet.</T>
        )}
        <Pressable accessibilityRole="button" onPress={() => nav.navigate('News')}>
          <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>All news ›</T>
        </Pressable>
      </View>
    ),
    <View key="market" style={{ gap: 14 }}>
      <T v="label">The market</T>
      {kse ? (
        <T v="monoLg" style={{ fontSize: 26 }}>
          KSE-100 {fmtNum(kse.current)}{' '}
          <T v="monoLg" style={{ fontSize: 20, color: changeColor(kse.changePct) }}>
            {fmtPct(kse.changePct)}
          </T>
        </T>
      ) : null}
      {mood ? (
        <T style={{ fontFamily: fonts.heavy, fontSize: 20, color: moodColor(mood.now.score) }}>
          Mood {mood.now.score}: {moodLabel(mood.now.score)}
        </T>
      ) : null}
      {next ? (
        <T v="body" style={{ fontSize: 14.5, color: colors.text2 }}>
          Next: {next.title} ({next.day})
        </T>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => nav.navigate('Tabs', { screen: 'Market' })}>
        <T style={{ fontFamily: fonts.semibold, color: colors.gold }}>Open the market ›</T>
      </Pressable>
    </View>,
    <View key="done" style={{ gap: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <ToolIcon name="checkCircle" size={48} color={colors.up} />
      <T style={{ fontFamily: fonts.heavy, fontSize: 20 }}>That's today</T>
      <T v="caption" style={{ textAlign: 'center' }}>
        Every tool is below. Swipe back any time.
      </T>
    </View>,
  ];

  const cards = all.filter(Boolean) as React.ReactNode[];
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))} scrollEventThrottle={64}>
        {cards.map((c, i) => (
          // each page is the full screen width, with the card inset by the usual margin
          <View key={i} style={{ width, paddingHorizontal: space.gutter }}>
            <View style={[styles.card, { width: w }]}>{c}</View>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { minHeight: 340, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, padding: 22 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
    dotOn: { width: 18, backgroundColor: colors.gold },
  }),
);
