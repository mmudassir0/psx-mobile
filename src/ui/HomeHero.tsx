/**
 * The top of Home (style A): one big number that counts up, today's move, a chart of how the
 * portfolio has done that draws itself in, and the few things worth a look today.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { changeColor, changeSoft, colors, fonts, tabular, themed } from '../theme';
import { fmtNum } from '../format';
import { onSnapshots, snapshots, trackReturns, type Snap } from '../portfolio/track';
import type { TodoItem } from '../portfolio/summary';
import { useMarket } from '../store/market';
import { haveFinalPrices } from '../market-hours';
import { DrawPath, PulseDot, Press, Rise, polyLength, useCountUp } from './motion';
import { ToolIcon } from './ToolIcon';
import { T } from './kit';
import { StyleSheet } from 'react-native';

type Range = '1W' | '1M' | '1Y' | 'All';
/** days back for each range; All has no start */
const DAYS: Record<Range, number | null> = { '1W': 7, '1M': 31, '1Y': 366, All: null };
/** an icon that says what the item is about */
function todoGlyph(t: TodoItem): string {
  if (t.route === 'Lab') return 'flask';
  if (t.route === 'Rebalance' || /trim|too big|share of your money/i.test(t.text)) return 'scale';
  if (t.route === 'SectorLimits') return 'shield';
  if (t.route === 'Announcements' || /notice/i.test(t.text)) return 'megaphone';
  if (t.route === 'Income' || t.route === 'DivPayments' || /dividend|pays|buy by|payout/i.test(t.text)) return 'coins';
  if (/target|rethink/i.test(t.text)) return 'target';
  if (/remind|due/i.test(t.text)) return 'bell';
  return t.symbol ? 'line' : 'bell';
}

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');

export function HomeHero({
  total,
  today,
  todayPct,
  pnlPct,
  holdings,
  todo,
  reviewing,
  onTodo,
}: {
  total: number;
  today: number;
  todayPct: number;
  pnlPct: number;
  holdings: number;
  todo: TodoItem[];
  reviewing: boolean;
  onTodo: (t: TodoItem) => void;
}) {
  const nav = useNavigation();
  const { marketOpen, updatedAt } = useMarket();
  const shown = useCountUp(total);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [range, setRange] = useState<Range>('1M');
  const [w, setW] = useState(0);
  useEffect(() => {
    snapshots()
      .then(setSnaps)
      .catch(() => {});
    return onSnapshots(setSnaps);
  }, []);

  // growth of the portfolio leaving out money put in or taken out
  const chart = useMemo(() => {
    const pts = trackReturns(snaps.filter((s) => s.value > 0));
    if (pts.length < 3 || w < 100) return null;
    const back = DAYS[range];
    const cut = back == null ? '' : new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
    const sel = pts.filter((p) => p.day >= cut);
    if (sel.length < 3) return null;
    const g = sel.map((p) => 1 + p.ret);
    const lo = Math.min(...g),
      hi = Math.max(...g);
    const H = 104;
    const xy = g.map((v, i) => [(i / (g.length - 1)) * w, 6 + (1 - (hi > lo ? (v - lo) / (hi - lo) : 0.5)) * (H - 12)] as [number, number]);
    const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const ch = g[g.length - 1] / g[0] - 1;
    return { d, area: `${d} L${w},${H} L0,${H} Z`, len: polyLength(xy), ch, H };
  }, [snaps, range, w]);

  const status = marketOpen ? 'market open' : haveFinalPrices(updatedAt) ? 'closing prices' : 'market closed';
  const lineColor = chart ? (chart.ch >= 0 ? colors.gold : colors.down) : colors.gold;
  return (
    <View style={styles.wrap}>
      <Rise delay={40}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`Your portfolio, ${fmtNum(total, 0)} rupees. Open Portfolio`}
          onPress={() => nav.navigate('Tabs', { screen: 'Portfolio' })}
          scaleTo={0.99}
          style={{ gap: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {marketOpen ? <PulseDot color={colors.up} /> : <View style={[styles.dot, { backgroundColor: colors.faint }]} />}
            <T style={styles.kicker}>Your portfolio · {status}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T style={styles.currency}>PKR</T>
            <T v="monoXl" style={{ fontSize: 38, lineHeight: 44 }} adjustsFontSizeToFit numberOfLines={1}>
              {fmtNum(shown ?? total, 0)}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <View style={[styles.pill, { backgroundColor: changeSoft(today) }]}>
              <T style={[styles.pillText, { color: changeColor(today) }]}>
                {sign(today)}
                {fmtNum(Math.abs(today), 0)} · {sign(todayPct)}
                {Math.abs(todayPct * 100).toFixed(2)}%
              </T>
            </View>
            <T v="caption">today</T>
            <T v="caption" style={{ marginLeft: 'auto' }}>
              {sign(pnlPct)}
              {Math.abs(pnlPct * 100).toFixed(1)}% all time · {holdings} stocks
            </T>
          </View>
        </Press>
      </Rise>

      <Rise delay={110}>
        <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} style={{ gap: 10 }}>
          {chart ? (
            <Svg width={w} height={chart.H} accessibilityLabel={`Portfolio ${sign(chart.ch)}${Math.abs(chart.ch * 100).toFixed(1)}% over ${range}`}>
              <Path d={chart.area} fill={lineColor} fillOpacity={0.08} />
              <DrawPath drawKey={range} length={chart.len} d={chart.d} stroke={lineColor} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          ) : (
            <T v="caption" style={{ lineHeight: 18 }}>
              Your chart fills in as Sahm notes your portfolio each day.
            </T>
          )}
          {chart || snaps.length >= 3 ? (
            <View style={styles.ranges} accessibilityRole="tablist">
              {(['1W', '1M', '1Y', 'All'] as Range[]).map((k) => (
                <Press key={k} accessibilityRole="tab" accessibilityState={{ selected: k === range }} onPress={() => setRange(k)} style={[styles.range, k === range && styles.rangeOn]}>
                  <T style={[styles.rangeText, k === range && { color: colors.text, fontFamily: fonts.bold }]}>{k}</T>
                </Press>
              ))}
            </View>
          ) : null}
        </View>
      </Rise>

      {todo.length || reviewing ? (
        <Rise delay={180} style={{ gap: 10 }}>
          <T style={styles.h}>Worth a look</T>
          <View style={styles.list}>
            {reviewing && !todo.length ? (
              <T v="caption" style={{ paddingVertical: 14 }}>
                Checking your holdings…
              </T>
            ) : (
              todo.slice(0, 3).map((t, i, l) => (
                <Press key={t.key} accessibilityRole="button" onPress={() => onTodo(t)} scaleTo={0.985} style={[styles.row, i < l.length - 1 && styles.border]}>
                  <View style={[styles.tile, { backgroundColor: t.tone === 'down' ? colors.downSoft : t.tone === 'up' ? colors.upSoft : t.tone === 'gold' ? colors.goldSoft : colors.surface2 }]}>
                    <ToolIcon name={todoGlyph(t)} size={18} color={t.tone === 'down' ? colors.downText : t.tone === 'up' ? colors.up : t.tone === 'gold' ? colors.gold : colors.text2} />
                  </View>
                  <T style={{ flex: 1, fontSize: 14, lineHeight: 19 }} numberOfLines={2}>
                    {t.text}
                  </T>
                  <ToolIcon name="chev" size={16} color={colors.faint} />
                </Press>
              ))
            )}
            {todo.length > 3 ? (
              <Press accessibilityRole="button" onPress={() => nav.navigate('Tabs', { screen: 'Portfolio' })} style={{ paddingVertical: 10 }}>
                <T style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 13.5 }}>{todo.length - 3} more in Portfolio</T>
              </Press>
            ) : null}
          </View>
        </Rise>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { paddingHorizontal: 24, gap: 22 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
    currency: { fontFamily: fonts.monoMedium, fontSize: 18, color: colors.muted },
    pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    pillText: { fontFamily: fonts.monoBold, fontSize: 13.5, ...tabular },
    ranges: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 14, padding: 4 },
    range: { flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rangeOn: { backgroundColor: colors.surface2 },
    rangeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
    h: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
    list: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: colors.hairline },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    tile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  }),
);
