/** Every PSX announcement from your holdings and watchlist in one place, newest first, with what's new since you last looked. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useUser } from '../store/user';
import { cached, COMPANY_TTL } from '../psx/cache';
import { fetchCompany } from '../psx/api';
import { eachLimit } from '../limit';
import type { Announcement } from '../psx/types';
import { annSeenPref, inbox, KIND_LABEL, type AnnKind } from '../analysis/announcements';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, T, ScreenHeader } from '../ui/kit';
import { ToolIcon } from '../ui/ToolIcon';

const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');
const KIND_ICON: Record<AnnKind, string> = { results: 'bars', meeting: 'calendar', payout: 'coins', material: 'warn', insider: 'user', other: 'doc' };

export default function AnnouncementsScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { watchlist } = useUser();
  const seenAt = annSeenPref.use();
  // what counted as new when the screen opened stays marked while you're here
  const [openedSeen] = useState(() => seenAt);
  const [data, setData] = useState<Record<string, Announcement[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<AnnKind | 'all' | 'mine'>('all');
  const held = useMemo(() => new Set(holdings.map((h) => h.symbol)), [holdings]);
  const symbols = useMemo(() => [...new Set([...holdings.map((h) => h.symbol), ...watchlist])].slice(0, 40), [holdings, watchlist]);
  const alive = useRef(true);

  const load = async (force = false) => {
    await eachLimit(symbols, 3, async (s) => {
      const c = await cached(`company:${s}`, COMPANY_TTL, () => fetchCompany(s), { persist: true, force }).catch(() => null);
      if (alive.current && c) setData((d) => ({ ...d, [s]: c.announcements }));
    }, () => alive.current);
    if (alive.current) setLoading(false);
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      annSeenPref.set(Date.now());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join()]);

  const items = useMemo(() => inbox(data, openedSeen || seenAt), [data, openedSeen, seenAt]);
  const shown = items.filter((i) => (kind === 'all' ? true : kind === 'mine' ? held.has(i.symbol) : i.kind === kind));
  const kinds = (['results', 'payout', 'meeting', 'material', 'insider', 'other'] as AnnKind[]).filter((k) => items.some((i) => i.kind === k));
  const fresh = items.filter((i) => i.fresh).length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Announcements" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await load(true), setRefreshing(false))} tintColor={colors.gold} colors={[colors.gold]} />}
      >
        {!symbols.length ? (
          <Empty title="Nothing to follow yet" body="Add holdings or star stocks to see their announcements here." />
        ) : (
          <>
            <T v="caption">
              {symbols.length} companies: your holdings and watchlist · last 60 days{fresh ? ` · ${fresh} new since you last looked` : ''}
            </T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', 'mine', ...kinds] as const).map((k) => (
                <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: k === kind }} onPress={() => setKind(k)} style={[styles.chip, k === kind && styles.chipOn]}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 13, color: k === kind ? colors.onGold : colors.text2 }}>{k === 'all' ? 'All' : k === 'mine' ? 'My holdings' : KIND_LABEL[k]}</T>
                </Pressable>
              ))}
            </ScrollView>
            {loading && !items.length ? (
              <Skeleton kind="rows" n={6} label="Reading each company's announcements" />
            ) : (
              <Panel style={{ paddingVertical: 4 }}>
                {shown.length ? (
                  shown.map((a, i) => (
                    <Pressable
                      key={`${a.symbol}${a.date}${a.title}`}
                      accessibilityRole="link"
                      onPress={() => (a.url ? Linking.openURL(a.url).catch(() => {}) : nav.navigate('Stock', { symbol: a.symbol }))}
                      style={[styles.row, i < shown.length - 1 && styles.border]}
                    >
                      <View style={{ width: 24 }}>
                        <ToolIcon name={KIND_ICON[a.kind]} size={18} color={a.kind === 'material' ? colors.down : colors.gold} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <T style={{ fontFamily: fonts.bold, fontSize: 13.5, color: held.has(a.symbol) ? colors.text : colors.text2 }} onPress={() => nav.navigate('Stock', { symbol: a.symbol })}>
                            {a.symbol}
                          </T>
                          {a.fresh ? (
                            <View style={styles.newBadge}>
                              <T style={{ fontFamily: fonts.heavy, fontSize: 9.5, color: colors.onGold }}>NEW</T>
                            </View>
                          ) : null}
                          <T v="caption" style={{ marginLeft: 'auto' }}>
                            {fmtDay(dayT(a.date))}
                          </T>
                        </View>
                        <T v="body" style={{ fontSize: 13.5, lineHeight: 19 }} numberOfLines={3}>
                          {a.title}
                        </T>
                        <T v="caption">
                          {KIND_LABEL[a.kind]}
                          {a.url ? ' · tap to open the PDF' : ''}
                        </T>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <T v="caption" style={{ paddingVertical: 10 }}>
                    Nothing here in the last 60 days.
                  </T>
                )}
              </Panel>
            )}
            <T v="caption" style={{ lineHeight: 18 }}>
              From each company's page on the PSX data portal, refreshed hourly (pull down to refresh now). Insider trades are directors' and
              major shareholders' own buying and selling, which they must report.
            </T>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 12 },
    row: { flexDirection: 'row', gap: 10, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
    newBadge: { backgroundColor: colors.gold, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  }),
);
