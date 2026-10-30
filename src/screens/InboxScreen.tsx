/** Alerts inbox: every notification Sahm has sent, newest first; tap one to open what it's about. */
import React, { useEffect, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, space, themed } from '../theme';
import { fmtTime } from '../format';
import { clearInbox, inboxSeenPref, useInbox } from '../inbox';
import { Panel } from '../ui/bits';
import { Empty, ScreenHeader, T } from '../ui/kit';
import { Rise } from '../ui/motion';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string, today: string) => {
  if (d === today) return 'Today';
  if (d === new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10)) return 'Yesterday';
  return `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;
};

export default function InboxScreen() {
  const { list } = useInbox();
  // what was new when the screen opened stays marked while you read
  const seenAtOpen = useRef<number | null>(null);
  const seen = inboxSeenPref.use();
  if (seenAtOpen.current == null) seenAtOpen.current = seen;
  useEffect(() => {
    inboxSeenPref.set(Date.now());
  }, [list.length]);
  const today = pkDay(Date.now());
  const days = [...new Set(list.map((e) => pkDay(e.t)))];
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="Alerts inbox"
        right={
          list.length ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => clearInbox()}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Clear</T>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!list.length ? (
          <Empty glyph="bell" title="No alerts yet" body="Price lines crossed, big moves in your holdings, the evening summary and new notices from your companies all land here too, so a notification you swipe away isn't lost." />
        ) : (
          days.map((d, k) => (
            <Rise key={d} delay={Math.min(k, 4) * 40} style={{ gap: 8 }}>
              <T v="label">{dayLabel(d, today)}</T>
              <Panel style={{ paddingVertical: 4 }}>
                {list
                  .filter((e) => pkDay(e.t) === d)
                  .map((e, i, all) => {
                    const fresh = e.t > (seenAtOpen.current ?? 0);
                    return (
                      <Pressable
                        key={`${e.t}${i}`}
                        accessibilityRole={e.url ? 'link' : undefined}
                        disabled={!e.url}
                        onPress={() => e.url && Linking.openURL(e.url).catch(() => {})}
                        style={({ pressed }) => [styles.row, i < all.length - 1 && styles.border, pressed && { opacity: 0.6 }]}
                      >
                        <View style={[styles.dot, { backgroundColor: fresh ? colors.gold : 'transparent' }]} />
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                            <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }} numberOfLines={2}>
                              {e.title}
                            </T>
                            <T v="caption" style={{ fontFamily: fonts.mono, fontSize: 11.5 }}>
                              {fmtTime(e.t)}
                            </T>
                          </View>
                          <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
                            {e.body}
                          </T>
                        </View>
                      </Pressable>
                    );
                  })}
              </Panel>
            </Rise>
          ))
        )}
        <T v="caption" style={{ lineHeight: 17 }}>
          Kept on this phone only, the latest 100.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space.gutter, paddingBottom: 48, gap: 16 },
    row: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  }),
);
