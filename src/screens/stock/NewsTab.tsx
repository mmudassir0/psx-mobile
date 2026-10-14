import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../../theme';
import { fmtDay } from '../../format';
import type { Announcement } from '../../psx/types';
import { Empty, Icon, Loading, T } from '../../ui/kit';

const day = (a: Announcement) => fmtDay(Date.parse(a.date + 'T12:00:00Z'));

export function NewsTab({ items, loading }: { items: Announcement[]; loading: boolean }) {
  const cats = useMemo(() => {
    const order = ['Financial Results', 'Board Meetings', 'Others'];
    const found = Array.from(new Set(items.map((a) => a.category)));
    found.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return ['All', ...found];
  }, [items]);
  const [cat, setCat] = useState('All');
  const [limit, setLimit] = useState(25);
  if (loading) return <Loading />;
  if (!items.length) return <Empty title="No announcements" body="PSX has no filings listed for this company." />;

  const shown = (cat === 'All' ? items : items.filter((a) => a.category === cat)).slice(0, limit);
  return (
    <View style={{ gap: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {cats.map((c) => {
          const on = c === cat;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setCat(c);
                setLimit(25);
              }}
              style={[styles.pill, on && styles.pillOn]}
            >
              <T style={{ fontFamily: fonts.bold, fontSize: 13, color: on ? colors.onGold : colors.text2 }}>{c}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      <View>
        {shown.map((a, i) => (
          <Pressable
            key={a.date + a.title}
            accessibilityRole={a.url ? 'link' : undefined}
            onPress={a.url ? () => Linking.openURL(a.url!) : undefined}
            style={({ pressed }) => [styles.item, i < shown.length - 1 && styles.border, pressed && a.url ? { opacity: 0.6 } : null]}
          >
            <View style={{ width: 62, gap: 2 }}>
              <T v="caption" style={{ fontFamily: fonts.semibold, color: colors.text2 }}>
                {day(a).replace(/ \d{4}$/, '')}
              </T>
              <T v="caption" style={{ fontSize: 11.5 }}>
                {a.date.slice(0, 4)}
              </T>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="body" style={{ fontSize: 14.5, lineHeight: 20 }}>
                {a.title}
              </T>
              <T v="caption">{a.category}</T>
            </View>
            {a.url ? (
              <View style={styles.pdf}>
                <Icon name="doc" size={16} color={colors.downText} />
                <T style={{ fontFamily: fonts.bold, fontSize: 10.5, color: colors.downText }}>PDF</T>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      {(cat === 'All' ? items.length : items.filter((a) => a.category === cat).length) > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setLimit((l) => l + 25)} style={{ alignItems: 'center', padding: 8 }}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Show more</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pill: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    pillOn: { backgroundColor: colors.gold },
    item: { flexDirection: 'row', gap: 12, paddingVertical: 14, alignItems: 'flex-start' },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    pdf: { alignItems: 'center', gap: 2, paddingTop: 2, width: 34 },
  }),
);
