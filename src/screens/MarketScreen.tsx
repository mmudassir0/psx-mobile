import React, { useEffect, useMemo, useRef, useState } from 'react';
import { notesPref } from '../portfolio/notes';
import { useFlag } from '../flags';
import { Skeleton } from '../ui/Skeleton';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { TabParams } from '../nav/types';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtNum, fmtPct } from '../format';
import { INDEX_NAMES, MAIN_INDICES } from '../psx/api';
import { useMarket } from '../store/market';
import { useIndexSeries } from '../store/indexSeries';
import type { Stock } from '../psx/types';
import { shortSector } from '../sectors';
import { watchGroupsPref } from '../portfolio/watchGroups';
import { GroupBar } from '../ui/WatchGroups';
import { Change, Empty, Icon, Section, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { useUser } from '../store/user';
import { MoodCard } from '../ui/MoodCard';
import { Sparkline } from '../ui/PriceChart';
import { MarketStatus } from './HomeScreen';
import { FILTERS, FilterId, passes, screenLine, SortId, SORTS, screen } from '../analysis/screener';
import { balanceSheetFor } from '../analysis/ratios';
import { deleteScreen, markSeen, newSince, sameSettings, savedScreensPref, saveScreen, suggestName, type SavedScreen, type ScreenSettings } from '../analysis/savedScreens';
import { IconLabel } from '../ui/ToolIcon';

type Mode = 'gainers' | 'losers' | 'active' | 'all' | 'watch';
const MODES: { key: Mode; label: string }[] = [
  { key: 'gainers', label: 'Top gainers' },
  { key: 'losers', label: 'Top losers' },
  { key: 'active', label: 'Most active' },
  { key: 'all', label: 'All stocks' },
  { key: 'watch', label: 'Watchlist' },
];

interface SectorTile {
  name: string;
  pct: number;
  count: number;
}

function sectorTiles(stocks: Stock[]): SectorTile[] {
  const acc = new Map<string, { cap: number; weighted: number; count: number }>();
  for (const s of stocks) {
    if (s.marketCap == null || s.changePct == null || !s.sector || s.sector === 'Other') continue;
    const a = acc.get(s.sector) ?? { cap: 0, weighted: 0, count: 0 };
    a.cap += s.marketCap;
    a.weighted += s.marketCap * s.changePct;
    a.count += 1;
    acc.set(s.sector, a);
  }
  return [...acc.entries()]
    .sort((a, b) => b[1].cap - a[1].cap)
    .slice(0, 9)
    .map(([name, a]) => ({ name, pct: a.weighted / a.cap, count: a.count }));
}

export default function MarketScreen() {
  const nav = useNavigation();
  const { ready, stocks, indices, refresh, refreshing } = useMarket();
  const [mode, setMode] = useState<Mode>('gainers');
  const [shariahOnly, setShariahOnly] = useState(false);
  const [filters, setFilters] = useState<FilterId[]>([]);
  const [sort, setSort] = useState<SortId>('cap');
  const toggleFilter = (f: FilterId) => {
    setFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setLimit(10);
  };
  const [sector, setSector] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);
  const route = useRoute<RouteProp<TabParams, 'Market'>>();
  // Opened from the search bar on Home: put the cursor in the box.
  useEffect(() => {
    if (!route.params?.autoFocusSearch) return;
    const id = setTimeout(() => {
      searchRef.current?.focus();
      nav.setParams({ autoFocusSearch: undefined } as never);
    }, 250);
    return () => clearTimeout(id);
  }, [route.params?.autoFocusSearch, nav]);
  // opened on a given list (e.g. the watchlist from a tile or menu)
  useEffect(() => {
    const m = route.params?.mode;
    if (!m) return;
    setMode(m);
    setLimit(m === 'watch' ? 200 : 10);
    nav.setParams({ mode: undefined } as never);
  }, [route.params?.mode, nav]);
  const { watchlist } = useUser();
  const [group, setGroup] = useState<string | null>(null);
  const groups = watchGroupsPref.use();
  const watchOn = useFlag('watchlist');
  const [allIndices, setAllIndices] = useState(false);
  const [limit, setLimit] = useState(10);
  const sparks = useIndexSeries(MAIN_INDICES);

  const tiles = useMemo(() => sectorTiles(stocks), [stocks]);
  const orderedIdx = useMemo(() => {
    const main = MAIN_INDICES.map((c) => indices.find((i) => i.code === c)).filter(Boolean) as typeof indices;
    const rest = indices.filter((i) => !MAIN_INDICES.includes(i.code));
    return [...main, ...rest];
  }, [indices]);
  const shownIdx = allIndices ? orderedIdx : orderedIdx.slice(0, 5);

  const breadth = useMemo(() => {
    const traded = stocks.filter((s) => (s.volume ?? 0) > 0 && s.changePct != null);
    const up = traded.filter((s) => (s.changePct as number) > 0).length;
    const down = traded.filter((s) => (s.changePct as number) < 0).length;
    return {
      up,
      down,
      flat: traded.length - up - down,
      volume: traded.reduce((a, s) => a + (s.volume ?? 0), 0),
      traded: traded.length,
    };
  }, [stocks]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return stocks
      .filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
      .sort((a, b) => (a.symbol.startsWith(q) ? 0 : 1) - (b.symbol.startsWith(q) ? 0 : 1) || a.symbol.localeCompare(b.symbol))
      .slice(0, 40);
  }, [stocks, query]);

  const listFor = (st: ScreenSettings, grp: string | null = group) => {
    let l = stocks.filter((s) => (!st.shariahOnly || s.shariah) && (!st.sector || s.sector === st.sector) && st.filters.every((f) => passes(f, s, balanceSheetFor(s.symbol))));
    if (st.mode === 'watch') {
      const g = groups.find((x) => x.id === grp);
      const syms = g ? g.symbols : watchlist;
      return syms.map((w) => l.find((s) => s.symbol === w)).filter((s): s is (typeof l)[number] => !!s);
    }
    if (st.mode === 'all') return screen(l, [], st.sort, balanceSheetFor);
    if (st.mode === 'active') return l.filter((s) => (s.volume ?? 0) > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    l = l.filter((s) => s.changePct != null && (s.volume ?? 0) >= 10_000);
    l.sort((a, b) => (b.changePct as number) - (a.changePct as number));
    return st.mode === 'gainers' ? l.filter((s) => (s.changePct as number) > 0) : l.reverse().filter((s) => (s.changePct as number) < 0);
  };
  const current: ScreenSettings = { mode, filters, sort, sector, shariahOnly };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [watchSort, setWatchSort] = useState<'mine' | 'change' | 'yield' | 'pe'>('mine');
  const notes = notesPref.use();
  const list = useMemo(() => {
    const l = listFor(current);
    if (mode !== 'watch' || watchSort === 'mine') return l;
    const v = (s: (typeof l)[number]) => (watchSort === 'change' ? (s.changePct ?? -999) : watchSort === 'yield' ? (s.divYield ?? -1) : s.pe != null && s.pe > 0 ? -s.pe : -9999);
    return [...l].sort((a, b) => v(b) - v(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, mode, shariahOnly, sector, filters, sort, watchlist, group, groups, watchSort]);
  const saved = savedScreensPref.use();
  const [activeSaved, setActiveSaved] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [freshSyms, setFreshSyms] = useState<string[]>([]);
  const [pickCmp, setPickCmp] = useState<string[] | null>(null);
  // new matches per saved screen (only for screens of stocks, not today's movers)
  const savedNew = useMemo(() => {
    const m = new Map<string, number>();
    if (!stocks.length) return m;
    for (const sc of saved)
      if (sc.mode === 'all' || sc.mode === 'watch')
        m.set(
          sc.id,
          newSince(
            sc,
            listFor(sc, null).map((x) => x.symbol),
          ).length,
        );
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, stocks, watchlist, groups]);
  const isDefault = !filters.length && !shariahOnly && !sector && (mode !== 'all' || sort === 'cap');
  const matchingSame = saved.find((x) => sameSettings(x, current));
  const openSaved = (sc: SavedScreen) => {
    setMode(sc.mode);
    setFilters(sc.filters);
    setSort(sc.sort);
    setSector(sc.sector);
    setShariahOnly(sc.shariahOnly);
    setGroup(null);
    setLimit(sc.mode === 'watch' ? 200 : 30);
    setActiveSaved(sc.id);
    const now = listFor(sc, null).map((x) => x.symbol);
    setFreshSyms(sc.seen.length || sc.seenAt ? newSince(sc, now) : []);
    savedScreensPref.set(markSeen(saved, sc.id, now));
  };
  const activeSc = saved.find((x) => x.id === activeSaved && sameSettings(x, current)) ?? null;
  const fresh = new Set(activeSc ? freshSyms : []);
  const shown = list.slice(0, limit);
  const open = (symbol: string) => nav.navigate('Stock', { symbol });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <View style={[styles.pad, { gap: 12 }]}>
          <T v="h1">Market</T>
          <MarketStatus />
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.faint} />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search a stock by symbol or name"
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
        </View>

        {query ? (
          <View style={styles.pad}>
            {results.length === 0 ? (
              <Empty title="No match" body={`Nothing on PSX matches “${query}”.`} />
            ) : (
              results.map((s, i) => <StockRow key={s.symbol} stock={s} last={i === results.length - 1} onPress={() => open(s.symbol)} />)
            )}
          </View>
        ) : !ready ? (
          <View style={styles.pad}>
            <Skeleton kind="rows" n={8} label="Loading PSX prices" />
          </View>
        ) : (
          <>
            <View style={styles.pad}>
              <MoodCard />
            </View>
            <View style={styles.pad}>
              <Section title="Indices" action={orderedIdx.length > 5 ? (allIndices ? 'Show fewer' : `All ${orderedIdx.length}`) : undefined} onAction={() => setAllIndices((v) => !v)}>
                <View style={styles.card}>
                  {shownIdx.map((i, k) => (
                    <Pressable
                      key={i.code}
                      accessibilityRole="button"
                      accessibilityLabel={`${INDEX_NAMES[i.code] ?? i.code}, ${fmtNum(i.current)}, ${fmtPct(i.changePct)}`}
                      onPress={() => nav.navigate('Index', { code: i.code })}
                      style={({ pressed }) => [styles.idxRow, k < shownIdx.length - 1 && styles.border, pressed && { opacity: 0.6 }]}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <T
                          style={{
                            fontFamily: fonts.bold,
                            fontSize: 15,
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {INDEX_NAMES[i.code] ?? i.code}
                        </T>
                        <T v="caption" style={{ color: changeColor(i.change) }}>
                          {i.change != null ? `${i.change > 0 ? '+' : ''}${fmtNum(i.change)} pts` : '—'}
                        </T>
                      </View>
                      {sparks[i.code]?.length ? <Sparkline values={sparks[i.code]} width={64} height={26} /> : <View style={{ width: 64 }} />}
                      <View
                        style={{
                          alignItems: 'flex-end',
                          gap: 4,
                          minWidth: 104,
                        }}
                      >
                        <T v="mono" style={{ fontSize: 15 }}>
                          {fmtNum(i.current)}
                        </T>
                        <Change pct={i.changePct} pill />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </Section>
            </View>

            <View style={styles.pad}>
              <Section title="Market today">
                <View style={[styles.card, { padding: 16, gap: 10 }]}>
                  <View style={styles.breadth}>
                    <View
                      style={{
                        flex: breadth.up || 0.0001,
                        backgroundColor: colors.up,
                      }}
                    />
                    <View
                      style={{
                        flex: breadth.flat || 0.0001,
                        backgroundColor: colors.faint,
                      }}
                    />
                    <View
                      style={{
                        flex: breadth.down || 0.0001,
                        backgroundColor: colors.down,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Metric label="Up" value={String(breadth.up)} color={colors.up} />
                    <Metric label="Down" value={String(breadth.down)} color={colors.downText} />
                    <Metric label="Flat" value={String(breadth.flat)} />
                    <Metric label="Volume" value={fmtCompact(breadth.volume)} end />
                  </View>
                </View>
              </Section>
            </View>

            {tiles.length ? (
              <View style={styles.pad}>
                <Section title="Sectors" action={sector ? 'Clear filter' : 'Market map'} onAction={() => (sector ? setSector(null) : nav.navigate('Heatmap'))}>
                  <View style={styles.grid}>
                    {tiles.map((t) => {
                      const strength = Math.min(1, Math.abs(t.pct) / 2);
                      const bg = t.pct >= 0 ? `rgba(34,195,142,${0.1 + strength * 0.3})` : `rgba(242,92,106,${0.1 + strength * 0.3})`;
                      const on = sector === t.name;
                      return (
                        <Pressable
                          key={t.name}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${t.name}, ${fmtPct(t.pct)}. Show its stocks`}
                          onPress={() => {
                            setSector(on ? null : t.name);
                            setLimit(10);
                          }}
                          style={[styles.tile, { backgroundColor: bg }, on && styles.tileOn]}
                        >
                          <T
                            style={{
                              fontFamily: fonts.bold,
                              fontSize: 12.5,
                              color: colors.text,
                            }}
                            numberOfLines={1}
                          >
                            {shortSector(t.name)}
                          </T>
                          <T v="mono" style={{ fontSize: 14 }}>
                            {fmtPct(t.pct)}
                          </T>
                        </Pressable>
                      );
                    })}
                  </View>
                  <T v="caption">Change weighted by market cap. Tap a sector to filter the lists below.</T>
                </Section>
              </View>
            ) : null}

            <View style={styles.pad}>
              <Section title={sector ? `${shortSector(sector)} stocks` : 'Stocks'}>
                {saved.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
                    <T v="caption">Saved:</T>
                    {saved.map((sc) => {
                      const on = activeSc?.id === sc.id;
                      const n = savedNew.get(sc.id) ?? 0;
                      return (
                        <Pressable
                          key={sc.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${sc.name}${n ? `, ${n} new` : ''}`}
                          onPress={() => openSaved(sc)}
                          onLongPress={() => {
                            savedScreensPref.set(deleteScreen(saved, sc.id));
                            if (on) setActiveSaved(null);
                          }}
                          style={[
                            styles.fchip,
                            { flexDirection: 'row', gap: 6 },
                            on && {
                              borderColor: colors.gold,
                              backgroundColor: colors.surface2,
                            },
                          ]}
                        >
                          <T
                            style={{
                              fontFamily: fonts.bold,
                              fontSize: 12.5,
                              color: on ? colors.gold : colors.text2,
                            }}
                          >
                            {sc.name}
                          </T>
                          {n && !on ? (
                            <View style={styles.badge}>
                              <T
                                style={{
                                  fontFamily: fonts.bold,
                                  fontSize: 10.5,
                                  color: colors.onGold,
                                }}
                              >
                                {n} new
                              </T>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {MODES.filter((m) => m.key !== 'watch' || watchOn).map((m) => (
                    <Pressable
                      key={m.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: m.key === mode }}
                      onPress={() => {
                        setMode(m.key);
                        setLimit(10);
                      }}
                      style={[styles.chip, m.key === mode && styles.chipOn]}
                    >
                      <T
                        style={{
                          fontFamily: fonts.bold,
                          fontSize: 13,
                          color: m.key === mode ? colors.onGold : colors.text2,
                        }}
                      >
                        {m.label}
                      </T>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: shariahOnly }}
                    onPress={() => setShariahOnly((v) => !v)}
                    style={[
                      styles.chip,
                      shariahOnly && {
                        backgroundColor: colors.shariahSoft,
                        borderColor: colors.shariah,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <T
                      style={{
                        fontFamily: fonts.bold,
                        fontSize: 13,
                        color: shariahOnly ? colors.shariah : colors.text2,
                      }}
                    >
                      Shariah only
                    </T>
                  </Pressable>
                </ScrollView>
                {mode === 'watch' ? <GroupBar value={group} onChange={setGroup} /> : null}
                {mode === 'watch' && list.length >= 2 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
                    <T v="caption">Sort:</T>
                    {(
                      [
                        ['mine', 'My order'],
                        ['change', 'Today'],
                        ['yield', 'Dividend yield'],
                        ['pe', 'Lowest P/E'],
                      ] as const
                    ).map(([k, l]) => (
                      <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: watchSort === k }} onPress={() => setWatchSort(k)} style={[styles.fchip, watchSort === k && styles.fchipOn]}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: watchSort === k ? colors.text : colors.faint }}>{l}</T>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                {mode === 'watch' && list.length >= 2 ? (
                  pickCmp == null ? (
                    <Pressable accessibilityRole="button" onPress={() => setPickCmp([])} style={{ alignSelf: 'flex-start' }}>
                      <IconLabel name="scale">Compare some of these</IconLabel>
                    </Pressable>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <T v="caption">Pick 2 to 4 to compare side by side:</T>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {list.slice(0, 40).map((s) => {
                          const on = pickCmp.includes(s.symbol);
                          return (
                            <Pressable
                              key={s.symbol}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              onPress={() => setPickCmp(on ? pickCmp.filter((x) => x !== s.symbol) : pickCmp.length < 4 ? [...pickCmp, s.symbol] : pickCmp)}
                              style={[styles.fchip, on && { borderColor: colors.gold, backgroundColor: colors.surface2 }]}
                            >
                              <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: on ? colors.gold : colors.text2 }}>
                                {on ? '✓ ' : ''}
                                {s.symbol}
                              </T>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={pickCmp.length < 2}
                          onPress={() => {
                            nav.navigate('Compare', { symbols: pickCmp });
                            setPickCmp(null);
                          }}
                          style={[styles.cmpBtn, pickCmp.length < 2 && { opacity: 0.4 }]}
                        >
                          <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onGold }}>Compare {pickCmp.length || ''}</T>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={() => setPickCmp(null)}>
                          <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.faint }}>Cancel</T>
                        </Pressable>
                      </View>
                    </View>
                  )
                ) : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {FILTERS.map((f) => {
                    const on = filters.includes(f.id);
                    return (
                      <Pressable key={f.id} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggleFilter(f.id)} style={[styles.fchip, on && styles.fchipOn]}>
                        <T
                          style={{
                            fontFamily: fonts.bold,
                            fontSize: 12.5,
                            color: on ? colors.text : colors.faint,
                          }}
                        >
                          {f.label}
                        </T>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {mode === 'all' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
                    <T v="caption">Sort:</T>
                    {SORTS.map((o) => (
                      <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: o.id === sort }} onPress={() => setSort(o.id)} style={[styles.fchip, o.id === sort && styles.fchipOn]}>
                        <T
                          style={{
                            fontFamily: fonts.bold,
                            fontSize: 12.5,
                            color: o.id === sort ? colors.text : colors.faint,
                          }}
                        >
                          {o.label}
                        </T>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                {filters.length || shariahOnly ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <T v="caption" style={{ flex: 1 }}>
                      {list.length} stock{list.length === 1 ? '' : 's'} match
                      {filters.some((f) => FILTERS.find((x) => x.id === f)?.needsBalance) ? ' (ROE and debt are known for KSE-100 and KMI-30 members only)' : ''}
                    </T>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => (setFilters([]), setShariahOnly(false))}>
                      <T
                        style={{
                          fontFamily: fonts.semibold,
                          fontSize: 13,
                          color: colors.gold,
                        }}
                      >
                        Reset filters
                      </T>
                    </Pressable>
                  </View>
                ) : null}
                {naming != null ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <TextInput
                      value={naming}
                      onChangeText={setNaming}
                      autoFocus
                      placeholder="Name this screen"
                      placeholderTextColor={colors.faint}
                      style={[styles.search, styles.searchInput, { height: 40, flex: 1 }]}
                      accessibilityLabel="Name for this screen"
                      onSubmitEditing={() => {
                        const next = saveScreen(
                          saved,
                          naming,
                          current,
                          list.map((x) => x.symbol),
                        );
                        savedScreensPref.set(next);
                        setActiveSaved(next.find((x) => sameSettings(x, current))?.id ?? null);
                        setFreshSyms([]);
                        setNaming(null);
                      }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        const next = saveScreen(
                          saved,
                          naming,
                          current,
                          list.map((x) => x.symbol),
                        );
                        savedScreensPref.set(next);
                        setActiveSaved(next.find((x) => sameSettings(x, current))?.id ?? null);
                        setFreshSyms([]);
                        setNaming(null);
                      }}
                    >
                      <T
                        style={{
                          fontFamily: fonts.bold,
                          fontSize: 14,
                          color: colors.gold,
                        }}
                      >
                        Save
                      </T>
                    </Pressable>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setNaming(null)}>
                      <T
                        style={{
                          fontFamily: fonts.semibold,
                          fontSize: 14,
                          color: colors.faint,
                        }}
                      >
                        Cancel
                      </T>
                    </Pressable>
                  </View>
                ) : !isDefault && !matchingSame ? (
                  <Pressable accessibilityRole="button" onPress={() => setNaming(suggestName(current, (f) => FILTERS.find((x) => x.id === f)?.label ?? f, shortSector))} style={{ alignSelf: 'flex-start' }}>
                    <T
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 13,
                        color: colors.gold,
                      }}
                    >
                      ＋ Save this screen
                    </T>
                  </Pressable>
                ) : activeSc && fresh.size ? (
                  <T v="caption" style={{ color: colors.gold }}>
                    {fresh.size} new since you last looked: {[...fresh].slice(0, 6).join(', ')}
                    {fresh.size > 6 ? '…' : ''}
                  </T>
                ) : saved.length && !naming ? (
                  <T v="caption" style={{ fontSize: 11.5 }}>
                    Long-press a saved screen to delete it.
                  </T>
                ) : null}
                {shown.length === 0 ? (
                  <Empty title="No stocks here" body="Try another list or clear the filters." />
                ) : (
                  <View>
                    {shown.map((s, i) => (
                      <StockRow
                        key={s.symbol}
                        stock={s}
                        highlight={fresh.has(s.symbol) || (mode === 'all' && (filters.length > 0 || sort !== 'cap'))}
                        sub={
                          [
                            fresh.has(s.symbol) ? 'New here' : null,
                            mode === 'watch' && notes[s.symbol]?.why ? `Note: ${notes[s.symbol].why.slice(0, 60)}${notes[s.symbol].why.length > 60 ? '…' : ''}` : null,
                            mode === 'watch' && watchSort === 'yield' && s.divYield != null ? `yield ${s.divYield.toFixed(1)}%` : null,
                            mode === 'watch' && watchSort === 'pe' && s.pe ? `P/E ${s.pe.toFixed(1)}` : null,
                            mode === 'active' ? volumeLabel(s) : filters.length || (mode === 'all' && sort !== 'cap') ? screenLine(s, balanceSheetFor(s.symbol)) || null : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || undefined
                        }
                        last={i === shown.length - 1}
                        onPress={() => open(s.symbol)}
                      />
                    ))}
                  </View>
                )}
                {list.length > limit ? (
                  <Pressable accessibilityRole="button" onPress={() => setLimit((l) => l + 30)} style={styles.more}>
                    <T
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 14,
                        color: colors.gold,
                      }}
                    >
                      Show more ({list.length - limit} left)
                    </T>
                  </Pressable>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: colors.shariah,
                    }}
                  />
                  <T v="caption">Shariah-compliant (KMI All Share index)</T>
                </View>
              </Section>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, color, end }: { label: string; value: string; color?: string; end?: boolean }) {
  return (
    <View style={{ gap: 2, flex: end ? 1.4 : 1, alignItems: end ? 'flex-end' : 'flex-start' }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 15, color: color ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    content: { paddingTop: 8, paddingBottom: 40, gap: 26 },
    pad: { paddingHorizontal: space.gutter },
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
    searchInput: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.medium,
      fontSize: 15,
      paddingVertical: 0,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
    },
    idxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 66,
      paddingVertical: 10,
    },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    breadth: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      gap: 2,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tile: {
      width: '32%',
      flexGrow: 1,
      height: 64,
      borderRadius: 14,
      padding: 11,
      justifyContent: 'space-between',
    },
    tileOn: { borderWidth: 2, borderColor: colors.gold },
    fchip: {
      height: 32,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    fchipOn: { backgroundColor: colors.surface2, borderColor: colors.line },
    chip: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { backgroundColor: colors.gold },
    more: { paddingVertical: 12, alignItems: 'center' },
    cmpBtn: { paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: colors.gold, justifyContent: 'center' },
    badge: {
      backgroundColor: colors.gold,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
  }),
);
