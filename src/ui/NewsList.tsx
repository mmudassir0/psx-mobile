/** Business news headlines: tap one to read it on the publisher's site. */
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { isNewsFeed, newsItems, type NewsFeed, type NewsItem } from '../analysis/news';
import { useFeedFile } from '../picks/feed';
import { T } from './kit';

export function useNews() {
  const f = useFeedFile<NewsFeed>('news.json', isNewsFeed);
  return { ...f, items: newsItems(f.data) };
}

export function ago(t: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m || 1} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function NewsRows({ items, held, max }: { items: NewsItem[]; held?: Set<string>; max?: number }) {
  const list = max ? items.slice(0, max) : items;
  return (
    <View>
      {list.map((n, i) => (
        <Pressable key={n.url} accessibilityRole="link" onPress={() => Linking.openURL(n.url).catch(() => {})} style={({ pressed }) => [styles.row, i < list.length - 1 && styles.border, pressed && { opacity: 0.6 }]}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 }}>{n.title}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <T v="caption">
              {n.source} · {ago(n.t)}
            </T>
            {n.symbols.slice(0, 4).map((s) => (
              <View key={s} style={[styles.tag, held?.has(s) && styles.tagHeld]}>
                <T style={{ fontSize: 11, fontFamily: fonts.bold, color: held?.has(s) ? colors.gold : colors.muted }}>{s}</T>
              </View>
            ))}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { paddingVertical: 10, gap: 4 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    tag: { paddingHorizontal: 6, height: 18, borderRadius: 5, backgroundColor: colors.surface2, justifyContent: 'center' },
    tagHeld: { backgroundColor: colors.goldSoft },
  }),
);
