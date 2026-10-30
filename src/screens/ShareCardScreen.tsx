/** A picture of how you're doing against the KSE-100, in percentages only (no rupee amounts), to send on WhatsApp. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useReviews } from '../portfolio/useReviews';
import { usePortfolioTotals } from '../portfolio/summary';
import { indexReturns, snapshots, trackReturns, type Snap } from '../portfolio/track';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { logProblem } from '../log';
import { Button, IconButton, Segmented, T, ScreenHeader } from '../ui/kit';

type Period = 'month' | 'tracked' | 'all';
const pct = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

// the card keeps its own fixed colours, so it looks the same in light and dark mode
const C = { bg: '#0D0E10', panel: '#16181B', text: '#F2F0EA', dim: '#A3A39C', gold: '#D9B762', up: '#4CC48A', down: '#F08A79', line: '#2A2D33' };

export default function ShareCardScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { name } = useUser();
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  const totals = usePortfolioTotals(rows, bySymbol);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [kse, setKse] = useState<SeriesPoint[] | null>(null);
  const [period, setPeriod] = useState<Period>('tracked');
  const [showTop, setShowTop] = useState(true);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const card = useRef<View>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
    cached<SeriesPoint[]>('eod:KSE100', 30 * 60_000, () => fetchSeries('eod', 'KSE100'), { persist: true }).then(setKse).catch(() => setKse([]));
  }, []);

  const view = useMemo(() => {
    if (period === 'all') return { you: totals.pnlPct, index: null as number | null, from: null as string | null, line: null as { you: number; idx: number | null }[] | null };
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const list = period === 'month' ? snaps.filter((s, i) => s.day >= monthAgo || snaps[i + 1]?.day >= monthAgo) : snaps;
    if (list.length < 2) return null;
    const tr = trackReturns(list);
    const idx = kse ? indexReturns(kse, tr.map((t) => t.day)) : tr.map(() => null);
    return { you: tr[tr.length - 1].ret, index: idx[idx.length - 1], from: tr[0].day, line: tr.map((t, i) => ({ you: t.ret, idx: idx[i] })) };
  }, [period, snaps, kse, totals.pnlPct]);

  const top = useMemo(
    () =>
      rows
        .filter((r) => r.holding.avgCost > 0)
        .map((r) => ({ s: r.holding.symbol, g: r.price / r.holding.avgCost - 1 }))
        .sort((a, b) => b.g - a.g)
        .slice(0, 3),
    [rows],
  );

  const share = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (Platform.OS === 'web') throw new Error('Sharing a picture works in the app on your phone');
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share' });
    } catch (e) {
      logProblem('share card', e);
      setMsg((e as Error).message || "Couldn't make the picture");
    } finally {
      setBusy(false);
    }
  };

  const label = period === 'all' ? 'Since I bought' : period === 'month' ? 'Last 30 days' : 'Since I started tracking';
  const ahead = view?.index != null ? view.you - view.index : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Share card" />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          options={[
            { key: 'month', label: '30 days' },
            { key: 'tracked', label: 'Tracked' },
            { key: 'all', label: 'Since bought' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <View ref={card} collapsable={false} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 18, color: C.gold }}>Sahm</T>
            <T style={{ fontSize: 12.5, color: C.dim, fontFamily: fonts.semibold }}>{fmtDay(Date.now())}</T>
          </View>
          <View style={{ gap: 2 }}>
            <T style={{ fontSize: 14, color: C.dim, fontFamily: fonts.semibold }}>
              {showName && name ? `${name}'s portfolio · ` : 'My portfolio · '}
              {label}
            </T>
            <T style={{ fontSize: 46, lineHeight: 56, marginTop: 2, fontFamily: fonts.heavy, color: (view?.you ?? 0) >= 0 ? C.up : C.down, letterSpacing: -1 }}>{view ? pct(view.you) : '–'}</T>
            {view?.index != null ? (
              <T style={{ fontSize: 15, color: C.text, fontFamily: fonts.semibold }}>
                KSE-100 {pct(view.index)} · {ahead! >= 0 ? `${(ahead! * 100).toFixed(1)} points ahead` : `${(-ahead! * 100).toFixed(1)} points behind`}
              </T>
            ) : null}
            {view?.from ? <T style={{ fontSize: 12, color: C.dim }}>from {fmtDay(dayT(view.from))}, after money added or taken out</T> : null}
          </View>
          {view?.line && view.line.length > 2 ? <MiniChart line={view.line} /> : null}
          {showTop && top.length ? (
            <View style={{ gap: 6 }}>
              <T style={{ fontSize: 12.5, color: C.dim, fontFamily: fonts.semibold }}>Best holdings so far</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {top.map((t) => (
                  <View key={t.s} style={styles.pill}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 13.5, color: C.text }}>{t.s}</T>
                    <T style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: t.g >= 0 ? C.up : C.down }}>{pct(t.g)}</T>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <T style={{ fontSize: 11, color: C.dim }}>Percentages only. Past returns don't promise future ones.</T>
        </View>
        {!view ? <T v="caption">Not enough days tracked yet for this period: Sahm saves a snapshot each day you open it.</T> : null}
        <View style={styles.opt}>
          <T v="body" style={{ flex: 1 }}>
            Show my best holdings
          </T>
          <Switch value={showTop} onValueChange={setShowTop} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
        </View>
        <View style={styles.opt}>
          <T v="body" style={{ flex: 1 }}>
            Show my name
          </T>
          <Switch value={showName} onValueChange={setShowName} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
        </View>
        <Button label={busy ? 'Making the picture…' : 'Share picture'} disabled={busy || !view} onPress={share} />
        {msg ? (
          <T v="caption" style={{ color: colors.downText }}>
            {msg}
          </T>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniChart({ line }: { line: { you: number; idx: number | null }[] }) {
  const W = 300;
  const H = 90;
  const vals = line.flatMap((p) => [p.you, p.idx ?? p.you, 0]);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const x = (i: number) => (i / (line.length - 1)) * W;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo || 1)) * (H - 8);
  const path = (f: (p: (typeof line)[number]) => number | null) =>
    line
      .map((p, i) => [i, f(p)] as const)
      .filter(([, v]) => v != null)
      .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v!).toFixed(1)}`)
      .join('');
  return (
    <View style={{ gap: 4 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={`M0 ${y(0)}L${W} ${y(0)}`} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={path((p) => p.idx)} stroke={C.dim} strokeWidth={1.4} fill="none" />
        <Path d={path((p) => p.you)} stroke={C.gold} strokeWidth={2.2} fill="none" />
      </Svg>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <T style={{ fontSize: 11.5, color: C.gold, fontFamily: fonts.semibold }}>— Me</T>
        <T style={{ fontSize: 11.5, color: C.dim, fontFamily: fonts.semibold }}>— KSE-100</T>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    card: { backgroundColor: C.bg, borderRadius: 22, padding: 20, gap: 16, borderWidth: 1, borderColor: C.line },
    pill: { flex: 1, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 1 },
    opt: { flexDirection: 'row', alignItems: 'center' },
  }),
);
