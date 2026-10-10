import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { shortSector } from '../sectors';
import { fmtPct } from '../format';
import { useMarket } from '../store/market';
import type { Stock } from '../psx/types';
import { Chip, Empty, Icon, Loading, Segmented, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { MarketStatus } from './HomeScreen';

type Mode = 'gainers' | 'losers' | 'active' | 'all';

interface SectorTile {
  name: string;
  pct: number;
}

function sectorTiles(stocks: Stock[]): SectorTile[] {
  const acc = new Map<string, { cap: number; weighted: number }>();
  for (const s of stocks) {
    if (s.marketCap == null || s.changePct == null || !s.sector || s.sector === 'Other') continue;
    const a = acc.get(s.sector) ?? { cap: 0, weighted: 0 };
    a.cap += s.marketCap;
    a.weighted += s.marketCap * s.changePct;
    acc.set(s.sector, a);
  }
  return [...acc.entries()]
    .sort((a, b) => b[1].cap - a[1].cap)
    .slice(0, 6)
    .map(([name, a]) => ({ name, pct: a.weighted / a.cap }));
}

export default function MarketScreen() {
  const nav = useNavigation();
  const { ready, stocks, refresh, refreshing } = useMarket();
  const [mode, setMode] = useState<Mode>('gainers');
  const [shariahOnly, setShariahOnly] = useState(false);
  const [query, setQuery] = useState('');

  const tiles = useMemo(() => sectorTiles(stocks), [stocks]);

  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    let l = stocks.filter((s) => !shariahOnly || s.shariah);
    if (q) {
      return l
        .filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
        .sort((a, b) => (a.symbol.startsWith(q) ? 0 : 1) - (b.symbol.startsWith(q) ? 0 : 1) || a.symbol.localeCompare(b.symbol))
        .slice(0, 60);
    }
    if (mode === 'all') return l;
    if (mode === 'active') return [...l].filter((s) => (s.volume ?? 0) > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 50);
    l = l.filter((s) => s.changePct != null && (s.volume ?? 0) >= 10_000);
    l.sort((a, b) => (b.changePct as number) - (a.changePct as number));
    return (mode === 'gainers' ? l : l.reverse()).slice(0, 50);
  }, [stocks, mode, shariahOnly, query]);

  const header = (
    <View style={{ gap: 16, paddingBottom: 6 }}>
      <View style={styles.between}>
        <T v="h1">Market</T>
      </View>
      <MarketStatus />
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search symbol or company"
          placeholderTextColor={colors.faint}
          style={styles.searchInput}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Search stocks"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
            <Icon name="close" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>
      {!query && tiles.length > 0 ? (
        <View style={styles.grid} accessibilityLabel="Largest sectors today">
          {tiles.map((t) => {
            const strength = Math.min(1, Math.abs(t.pct) / 2);
            const bg = t.pct >= 0 ? `rgba(61,220,151,${0.1 + strength * 0.3})` : `rgba(255,90,95,${0.1 + strength * 0.3})`;
            return (
              <View key={t.name} style={[styles.tile, { backgroundColor: bg }]}>
                <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.text }} numberOfLines={1}>
                  {shortSector(t.name)}
                </T>
                <T v="mono" style={{ fontSize: 13 }}>
                  {fmtPct(t.pct)}
                </T>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Segmented
            options={[
              { key: 'gainers', label: 'Gainers' },
              { key: 'losers', label: 'Losers' },
              { key: 'active', label: 'Active' },
              { key: 'all', label: 'All' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setQuery('');
            }}
          />
        </View>
        <Chip label="Shariah" on={shariahOnly} onPress={() => setShariahOnly((v) => !v)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.shariah }} />
        <T v="caption">Shariah-compliant (KMI All-Share index)</T>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={ready ? list : []}
        keyExtractor={(s) => s.symbol}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
        renderItem={({ item, index }) => (
          <StockRow
            stock={item}
            sub={mode === 'active' && !query ? volumeLabel(item) : undefined}
            last={index === list.length - 1}
            onPress={() => nav.navigate('Stock', { symbol: item.symbol })}
          />
        )}
        ListEmptyComponent={
          !ready ? <Loading label="Loading PSX prices…" /> : <Empty title="Nothing found" body={query ? `No stock matches “${query}”.` : 'No stocks in this list right now.'} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '32%', flexGrow: 1, height: 64, borderRadius: 14, padding: 11, justifyContent: 'space-between' },
});
