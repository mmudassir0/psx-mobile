import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtNum, fmtPct } from '../format';
import { INDEX_NAMES, MAIN_INDICES } from '../psx/api';
import { useMarket } from '../store/market';
import { useIndexSeries } from '../store/indexSeries';
import type { Stock } from '../psx/types';
import { shortSector } from '../sectors';
import { Change, Empty, Icon, Loading, Section, T } from '../ui/kit';
import { StockRow, volumeLabel } from '../ui/StockRow';
import { Sparkline } from '../ui/PriceChart';
import { MarketStatus } from './HomeScreen';

type Mode = 'gainers' | 'losers' | 'active' | 'all';
const MODES: { key: Mode; label: string }[] = [
  { key: 'gainers', label: 'Top gainers' },
  { key: 'losers', label: 'Top losers' },
  { key: 'active', label: 'Most active' },
  { key: 'all', label: 'All stocks' },
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
  const [sector, setSector] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
    return { up, down, flat: traded.length - up - down, volume: traded.reduce((a, s) => a + (s.volume ?? 0), 0), traded: traded.length };
  }, [stocks]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return stocks
      .filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
      .sort((a, b) => (a.symbol.startsWith(q) ? 0 : 1) - (b.symbol.startsWith(q) ? 0 : 1) || a.symbol.localeCompare(b.symbol))
      .slice(0, 40);
  }, [stocks, query]);

  const list = useMemo(() => {
    let l = stocks.filter((s) => (!shariahOnly || s.shariah) && (!sector || s.sector === sector));
    if (mode === 'all') return [...l].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    if (mode === 'active') return l.filter((s) => (s.volume ?? 0) > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    l = l.filter((s) => s.changePct != null && (s.volume ?? 0) >= 10_000);
    l.sort((a, b) => (b.changePct as number) - (a.changePct as number));
    return mode === 'gainers' ? l.filter((s) => (s.changePct as number) > 0) : l.reverse().filter((s) => (s.changePct as number) < 0);
  }, [stocks, mode, shariahOnly, sector]);
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
          <Loading label="Loading PSX prices" />
        ) : (
          <>
            <View style={styles.pad}>
              <Section
                title="Indices"
                action={orderedIdx.length > 5 ? (allIndices ? 'Show fewer' : `All ${orderedIdx.length}`) : undefined}
                onAction={() => setAllIndices((v) => !v)}
              >
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
                        <T style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.text }} numberOfLines={1}>
                          {INDEX_NAMES[i.code] ?? i.code}
                        </T>
                        <T v="caption" style={{ color: changeColor(i.change) }}>
                          {i.change != null ? `${i.change > 0 ? '+' : ''}${fmtNum(i.change)} pts` : '—'}
                        </T>
                      </View>
                      {sparks[i.code]?.length ? <Sparkline values={sparks[i.code]} width={64} height={26} /> : <View style={{ width: 64 }} />}
                      <View style={{ alignItems: 'flex-end', gap: 4, minWidth: 104 }}>
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
                    <View style={{ flex: breadth.up || 0.0001, backgroundColor: colors.up }} />
                    <View style={{ flex: breadth.flat || 0.0001, backgroundColor: colors.faint }} />
                    <View style={{ flex: breadth.down || 0.0001, backgroundColor: colors.down }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Metric label="Advancing" value={String(breadth.up)} color={colors.up} />
                    <Metric label="Declining" value={String(breadth.down)} color={colors.downText} />
                    <Metric label="Unchanged" value={String(breadth.flat)} />
                    <Metric label="Volume" value={fmtCompact(breadth.volume)} />
                  </View>
                </View>
              </Section>
            </View>

            {tiles.length ? (
              <View style={styles.pad}>
                <Section title="Sectors" action={sector ? 'Clear filter' : undefined} onAction={() => setSector(null)}>
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
                          <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.text }} numberOfLines={1}>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {MODES.map((m) => (
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
                      <T style={{ fontFamily: fonts.bold, fontSize: 13, color: m.key === mode ? colors.onGold : colors.text2 }}>{m.label}</T>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: shariahOnly }}
                    onPress={() => setShariahOnly((v) => !v)}
                    style={[styles.chip, shariahOnly && { backgroundColor: colors.shariahSoft, borderColor: colors.shariah, borderWidth: 1 }]}
                  >
                    <T style={{ fontFamily: fonts.bold, fontSize: 13, color: shariahOnly ? colors.shariah : colors.text2 }}>Shariah only</T>
                  </Pressable>
                </ScrollView>
                {shown.length === 0 ? (
                  <Empty title="No stocks here" body="Try another list or clear the filters." />
                ) : (
                  <View>
                    {shown.map((s, i) => (
                      <StockRow
                        key={s.symbol}
                        stock={s}
                        sub={mode === 'active' ? volumeLabel(s) : undefined}
                        last={i === shown.length - 1}
                        onPress={() => open(s.symbol)}
                      />
                    ))}
                  </View>
                )}
                {list.length > limit ? (
                  <Pressable accessibilityRole="button" onPress={() => setLimit((l) => l + 30)} style={styles.more}>
                    <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Show more ({list.length - limit} left)</T>
                  </Pressable>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.shariah }} />
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

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 15, color: color ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
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
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 0 },
  card: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14 },
  idxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  breadth: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '32%', flexGrow: 1, height: 64, borderRadius: 14, padding: 11, justifyContent: 'space-between' },
  tileOn: { borderWidth: 2, borderColor: colors.gold },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.gold },
  more: { paddingVertical: 12, alignItems: 'center' },
}));
