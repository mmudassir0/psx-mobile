/** All recent business headlines Sahm collected, filtered to your holdings, the market, or everything. */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, space, themed } from '../theme';
import { useHoldings } from '../portfolio/holdings';
import { NEWS_FEEDS } from '../analysis/news';
import { Panel } from '../ui/bits';
import { Empty, IconButton, Segmented, T } from '../ui/kit';
import { Skeleton } from '../ui/Skeleton';
import { NewsRows, useNews } from '../ui/NewsList';

export default function NewsScreen() {
  const nav = useNavigation();
  const { items, loading, error, reload } = useNews();
  const { holdings } = useHoldings();
  const held = new Set(holdings.map((h) => h.symbol));
  const [filter, setFilter] = useState<'mine' | 'market' | 'all'>(held.size ? 'mine' : 'all');
  const shown = items.filter((n) => (filter === 'mine' ? n.symbols.some((s) => held.has(s)) : filter === 'market' ? n.market : true));
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          News
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={reload} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <Segmented
          options={[
            { key: 'mine', label: 'My holdings' },
            { key: 'market', label: 'Market' },
            { key: 'all', label: 'All' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {!items.length && loading ? (
          <Skeleton kind="rows" n={6} />
        ) : !items.length ? (
          <Empty title="No news yet" body={error === 'Not published yet' ? 'Headlines arrive with the next daily update.' : `Couldn't load the news: ${error ?? 'unknown error'}`} />
        ) : !shown.length ? (
          <Empty title="Nothing here" body={filter === 'mine' ? 'No recent headline names one of your holdings.' : 'Try All.'} />
        ) : (
          <Panel style={{ paddingVertical: 2 }}>
            <NewsRows items={shown} held={held} />
          </Panel>
        )}
        <T v="caption" style={{ lineHeight: 18 }}>
          Headlines from {NEWS_FEEDS.map((f) => f.source).join(', ')}, collected twice a day and matched to PSX companies by name, so a
          story can be missed or tagged to the wrong company. Tap to read it on the publisher's site.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
  }),
);
