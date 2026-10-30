/**
 * "Today": one short list of everything that needs a look, merged from your
 * to-dos (Review, payouts, bonus, results, Trim), the days ahead (rate
 * decision, ex-dates, holidays), news naming your holdings and price alerts
 * that are close.
 */
import React from 'react';
import { useFlags } from '../flags';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import type { TodoItem } from '../portfolio/summary';
import type { Row } from '../portfolio/useReviews';
import { watchRulesPref } from '../portfolio/prefs';
import { describeRule, priceLine } from '../analysis/watch';
import { useMarket } from '../store/market';
import { eventsFor, useWatchRows } from './EventsCard';
import { useNews, ago } from './NewsList';
import { Panel } from './bits';
import { Section, T } from './kit';
import { EVENT_GLYPH, ToolIcon } from './ToolIcon';

interface Item {
  key: string;
  glyph: string;
  /** colour of the glyph */
  ink?: string;
  text: string;
  sub?: string;
  tone?: string;
  onPress: () => void;
}

const toneInk = (t: TodoItem['tone']) => (t === 'down' ? colors.down : t === 'gold' ? colors.gold : t === 'up' ? colors.up : colors.faint);
const dayName = (d: string) => {
  const t = new Date(d + 'T12:00:00Z');
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()]} ${t.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getUTCMonth()]}`;
};

export type { Item as TodayItem };

export function useTodayItems(rows: Row[], todo: TodoItem[], max = 7): Item[] {
  const nav = useNavigation();
  const { items: news } = useNews();
  const rules = watchRulesPref.use();
  const { bySymbol } = useMarket();
  const on = useFlags();
  const held = new Set(rows.map((r) => r.holding.symbol));
  const watchRows = useWatchRows(rows);
  const toPortfolio = () => nav.navigate('Tabs', { screen: 'Portfolio', params: { view: 'holdings' } });
  const out: Item[] = todo.map((t) => ({
    key: `todo-${t.key}`,
    glyph: 'dot',
    ink: toneInk(t.tone),
    text: t.text,
    onPress: () => (t.route ? nav.navigate(t.route) : t.symbol ? nav.navigate('Stock', { symbol: t.symbol }) : toPortfolio()),
  }));
  for (const e of on('comingUp') ? eventsFor([...rows, ...watchRows], Date.now(), 7) : []) {
    // payouts already in the to-dos aren't repeated
    if (e.kind === 'exdate' && out.some((o) => e.symbol && o.text.startsWith(e.symbol + ':'))) continue;
    out.push({
      key: `ev-${e.kind}${e.symbol ?? ''}${e.day}`,
      glyph: EVENT_GLYPH[e.kind] ?? 'calendar',
      text: e.title,
      sub: `${e.kind === 'results' ? 'Any day now' : dayName(e.day)}${e.watch ? ' · watchlist' : ''}`,
      onPress: () => (e.symbol ? nav.navigate('Stock', { symbol: e.symbol }) : nav.navigate('Tabs', { screen: 'Market' })),
    });
  }
  for (const n of (on('news') ? news : []).filter((x) => x.symbols.some((s) => held.has(s)) && Date.now() - x.t < 2 * 864e5).slice(0, 2))
    out.push({ key: `news-${n.url}`, glyph: 'news', text: n.title, sub: `${n.source} · ${ago(n.t)}`, onPress: () => Linking.openURL(n.url).catch(() => {}) });
  for (const r of on('alerts') ? rules : []) {
    const p = bySymbol.get(r.symbol)?.price;
    const line = priceLine(r);
    if (p == null || line == null) continue;
    const gap = Math.abs(p / line - 1);
    if (gap < 0.02) out.push({ key: `alert-${r.symbol}${r.dir}${r.level}`, glyph: 'bell', text: `${describeRule(r)}: now ${p.toFixed(2)}`, sub: `${(gap * 100).toFixed(1)}% away`, onPress: () => nav.navigate('Alerts') });
  }
  return out.slice(0, max);
}

export function TodayList({ rows, todo, loading }: { rows: Row[]; todo: TodoItem[]; loading: boolean }) {
  const items = useTodayItems(rows, todo);
  return (
    <Section title="Today">
      <Panel style={{ paddingVertical: 4 }}>
        {items.length ? (
          items.map((it, i) => (
            <Pressable key={it.key} accessibilityRole="button" onPress={it.onPress} style={({ pressed }) => [styles.row, i < items.length - 1 && styles.border, pressed && { opacity: 0.6 }]}>
              <View style={{ width: 24, alignItems: 'center' }}>
                <ToolIcon name={it.glyph} size={it.glyph === 'dot' ? 12 : 18} color={it.ink ?? colors.gold} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 }} numberOfLines={2}>
                  {it.text}
                </T>
                {it.sub ? <T v="caption">{it.sub}</T> : null}
              </View>
              <T style={{ color: colors.faint }}>›</T>
            </Pressable>
          ))
        ) : (
          <T v="caption" style={{ paddingVertical: 12 }}>
            {loading ? 'Checking your holdings…' : 'Nothing needs your attention today.'}
          </T>
        )}
      </Panel>
    </Section>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
