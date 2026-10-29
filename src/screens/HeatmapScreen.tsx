/** The whole market at a glance: every sector and its stocks as tiles sized by market value, coloured by the move. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useHoldings } from '../portfolio/holdings';
import { shortSector } from '../sectors';
import { nested } from '../analysis/treemap';
import type { Stock } from '../psx/types';
import { IconButton, Segmented, T } from '../ui/kit';
import { Sunburst } from '../ui/Sunburst';
import { makePref } from '../prefs';

/** tiles or rings, remembered */
const stylePref = makePref<'tiles' | 'rings'>('ui.mapStyle', 'tiles');
import { MarketStatus } from './HomeScreen';

type Scope = 'kse100' | 'kmi30' | 'all' | 'mine';
type Period = 'today' | 'year';

const HEADER = 16;
/** How far a move has to go for the strongest colour. */
const FULL: Record<Period, number> = { today: 4, year: 60 };

function hex(c: string): [number, number, number] {
  const m = c.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}

export default function HeatmapScreen() {
  const nav = useNavigation();
  const { stocks, indices } = useMarket();
  const style = stylePref.use();
  const { watchlist } = useUser();
  const { holdings } = useHoldings();
  const [scope, setScope] = useState<Scope>('kse100');
  const [period, setPeriod] = useState<Period>('today');
  const [w, setW] = useState(0);
  const h = Math.round(w * 1.45);

  const move = (s: Stock) => (period === 'today' ? s.changePct : s.change1y);
  const list = useMemo(() => {
    const mine = new Set([...holdings.map((x) => x.symbol), ...watchlist]);
    const pick = stocks.filter((s) => (s.marketCap ?? 0) > 0 && s.price != null);
    if (scope === 'kse100') return pick.filter((s) => s.indexes.includes('KSE100'));
    if (scope === 'kmi30') return pick.filter((s) => s.indexes.includes('KMI30'));
    if (scope === 'mine') return pick.filter((s) => mine.has(s.symbol));
    return [...pick].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 150);
  }, [stocks, scope, holdings, watchlist]);
  const groups = useMemo(
    () =>
      w > 0
        ? nested(
            list,
            (s) => shortSector(s.sector),
            (s) => s.marketCap ?? 0,
            { x: 0, y: 0, w, h },
            HEADER,
          )
        : [],
    [list, w, h],
  );

  // value-weighted move of each sector, for its label
  const sectorMove = (g: (typeof groups)[number]) => {
    const tot = g.tiles.reduce((a, t) => a + (t.item.marketCap ?? 0), 0);
    const m = g.tiles.reduce((a, t) => a + (move(t.item) ?? 0) * (t.item.marketCap ?? 0), 0);
    return tot > 0 ? m / tot : 0;
  };
  const tileColor = (v: number | null) => {
    if (v == null) return colors.surface2;
    const k = Math.min(1, Math.abs(v) / FULL[period]);
    return mix(colors.surface2, v >= 0 ? colors.up : colors.down, 0.25 + 0.75 * k);
  };
  const up = list.filter((s) => (move(s) ?? 0) > 0).length;
  const down = list.filter((s) => (move(s) ?? 0) < 0).length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Market map
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <MarketStatus />
        <Segmented
          options={[
            { key: 'kse100', label: 'KSE-100' },
            { key: 'kmi30', label: 'KMI-30' },
            { key: 'all', label: 'Top 150' },
            { key: 'mine', label: 'Mine' },
          ]}
          value={scope}
          onChange={setScope}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Segmented
              options={[
                { key: 'today', label: 'Today' },
                { key: 'year', label: '1 year' },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Segmented
              options={[
                { key: 'tiles', label: 'Tiles' },
                { key: 'rings', label: 'Rings' },
              ]}
              value={style}
              onChange={(k) => stylePref.set(k)}
            />
          </View>
        </View>
        <T v="caption">
          {list.length} stocks · {up} up, {down} down · {style === 'rings' ? 'slice' : 'tile'} size is market value
        </T>
        {style === 'rings' ? (
          <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}>
            {list.length ? (
              <Sunburst
                stocks={list}
                group={(s) => shortSector(s.sector)}
                move={move}
                color={tileColor}
                size={w}
                center={{
                  label: scope === 'kse100' ? 'KSE-100' : scope === 'kmi30' ? 'KMI-30' : scope === 'mine' ? 'Yours' : 'Top 150',
                  move: period === 'today' && (scope === 'kse100' || scope === 'kmi30') ? (indices.find((i) => i.code === (scope === 'kse100' ? 'KSE100' : 'KMI30'))?.changePct ?? null) : null,
                }}
                onStock={(symbol) => nav.navigate('Stock', { symbol })}
              />
            ) : (
              <T v="caption">{scope === 'mine' ? 'Add holdings or watchlist stocks to see them here.' : 'Waiting for prices…'}</T>
            )}
          </View>
        ) : (
          <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ height: h || 400, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ground }}>
            {!list.length ? (
              <T v="caption" style={{ padding: 16 }}>
                {scope === 'mine' ? 'Add holdings or watchlist stocks to see them here.' : 'Waiting for prices…'}
              </T>
            ) : null}
            {groups.map((g) => (
              <React.Fragment key={g.group}>
                {g.tiles.map((t) => {
                  const v = move(t.item);
                  const big = t.w > 44 && t.h > 26;
                  // strong colours take white text; faint ones the normal text colour (readable in light mode too)
                  const ink = v != null && Math.abs(v) / FULL[period] > 0.45 ? '#FFFFFF' : colors.text;
                  return (
                    <Pressable
                      key={t.item.symbol}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.item.symbol} ${v != null ? v.toFixed(1) : ''}%`}
                      onPress={() => nav.navigate('Stock', { symbol: t.item.symbol })}
                      style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, padding: 1 }}
                    >
                      <View
                        style={{
                          flex: 1,
                          backgroundColor: tileColor(v),
                          borderRadius: 3,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {big ? (
                          <>
                            <T numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: Math.min(15, Math.max(9.5, t.w / 6)), lineHeight: Math.round(Math.min(15, Math.max(9.5, t.w / 6)) * 1.25), color: ink }}>
                              {t.item.symbol}
                            </T>
                            {t.h > 34 ? (
                              <T
                                numberOfLines={1}
                                style={{ fontFamily: fonts.monoMedium, fontSize: Math.min(12.5, Math.max(9, t.w / 8)), lineHeight: Math.round(Math.min(12.5, Math.max(9, t.w / 8)) * 1.25), color: ink, opacity: 0.9 }}
                              >
                                {v == null ? '–' : Math.abs(v) < (period === 'today' ? 0.05 : 0.5) ? '0%' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(period === 'today' ? 1 : 0)}%`}
                              </T>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
                {g.labelled ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: g.rect.x + 1,
                      top: g.rect.y,
                      width: g.rect.w - 2,
                      height: HEADER,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 3,
                      backgroundColor: colors.ground,
                    }}
                  >
                    {/* the line height matches the strip, so the name isn't cut in half */}
                    <T numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 10, lineHeight: 13, letterSpacing: 0.3, color: colors.text2 }}>
                      {g.group.toUpperCase()}
                    </T>
                    {g.rect.w >= 84 ? (
                      <T style={{ fontFamily: fonts.monoBold, fontSize: 10, lineHeight: 13, color: sectorMove(g) >= 0 ? colors.up : colors.downText }}>
                        {sectorMove(g) >= 0 ? '+' : ''}
                        {sectorMove(g).toFixed(1)}%
                      </T>
                    ) : null}
                  </View>
                ) : null}
              </React.Fragment>
            ))}
          </View>
        )}
        <T v="caption" style={{ lineHeight: 18 }}>
          Brighter green or red means a bigger move ({FULL[period]}% or more is the strongest). Sector figures are weighted by market value.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 12 },
  }),
);
