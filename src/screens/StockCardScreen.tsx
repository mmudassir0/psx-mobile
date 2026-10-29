/** A picture of one stock to send on WhatsApp: price, today's change, a chart and its key figures. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { RootParams } from '../nav/types';
import { colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtDay } from '../format';
import { useMarket } from '../store/market';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { sparkPath } from '../widget/spark';
import { logProblem } from '../log';
import { Button, IconButton, Segmented, T } from '../ui/kit';

type Span = '1M' | '3M' | '1Y';
const BARS: Record<Span, number> = { '1M': 22, '3M': 63, '1Y': 248 };
// the card is drawn in its own fixed colours, so it looks the same in light and dark mode
const C = { bg: '#121417', text: '#F2F0EA', dim: '#A3A39C', faint: '#6E6F69', up: '#4CC48A', down: '#F08A79', gold: '#D9B762', line: '#24272B' };

export default function StockCardScreen() {
  const nav = useNavigation();
  const { symbol } = useRoute<RouteProp<RootParams, 'StockCard'>>().params;
  const { bySymbol } = useMarket();
  const s = bySymbol.get(symbol);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [span, setSpan] = useState<Span>('3M');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const card = useRef<View>(null);
  useEffect(() => {
    cached<SeriesPoint[]>(`eod:${symbol}`, 30 * 60_000, () => fetchSeries('eod', symbol), { persist: true })
      .then(setSeries)
      .catch(() => setSeries([]));
  }, [symbol]);

  const pts = useMemo(() => (series ?? []).slice(-BARS[span]).map((p) => p.v), [series, span]);
  const yr = useMemo(() => (series ?? []).slice(-248).map((p) => p.v), [series]);
  const spanChange = pts.length > 1 ? pts[pts.length - 1] / pts[0] - 1 : null;
  const up = (s?.changePct ?? 0) >= 0;
  const lineUp = (spanChange ?? 0) >= 0;
  const W = 320;
  const H = 120;

  const share = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (Platform.OS === 'web') throw new Error('Sharing a picture works in the app on your phone');
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share ${symbol}` });
    } catch (e) {
      logProblem('stock card', e);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fig = (k: string, v: string) => (
    <View style={{ width: '33%', gap: 2, paddingVertical: 6 }}>
      <T style={{ fontSize: 11, color: C.dim }}>{k}</T>
      <T style={{ fontFamily: fonts.bold, fontSize: 14.5, color: C.text }}>{v}</T>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Share {symbol}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented options={(['1M', '3M', '1Y'] as Span[]).map((k) => ({ key: k, label: k }))} value={span} onChange={setSpan} />
        <View ref={card} collapsable={false} style={[styles.card, { backgroundColor: C.bg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 26, color: C.text }}>{symbol}</T>
            <T style={{ fontSize: 12, color: C.faint }}>{fmtDay(Date.now())}</T>
          </View>
          <T style={{ fontSize: 13, color: C.dim }} numberOfLines={1}>
            {s?.name ?? ''}
            {s?.sector ? ` · ${s.sector}` : ''}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 34, color: C.text }}>{s?.price != null ? `Rs ${s.price.toFixed(2)}` : '–'}</T>
            {s?.changePct != null ? (
              <T style={{ fontFamily: fonts.bold, fontSize: 17, color: up ? C.up : C.down }}>
                {up ? '+' : '−'}
                {Math.abs(s.changePct).toFixed(2)}% today
              </T>
            ) : null}
          </View>
          <View style={{ marginTop: 8 }}>
            {pts.length > 2 ? (
              <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <Path d={sparkPath(pts, W, H)} stroke={lineUp ? C.up : C.down} strokeWidth={2.4} fill="none" />
              </Svg>
            ) : (
              <View style={{ height: H }} />
            )}
            {spanChange != null ? (
              <T style={{ fontSize: 12, color: C.dim }}>
                {span === '1M' ? '1 month' : span === '3M' ? '3 months' : '1 year'}:{' '}
                <T style={{ fontFamily: fonts.bold, fontSize: 12, color: lineUp ? C.up : C.down }}>{`${lineUp ? '+' : '−'}${Math.abs(spanChange * 100).toFixed(1)}%`}</T>
              </T>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}>
            {fig('P/E', s?.pe != null && s.pe > 0 ? s.pe.toFixed(1) : '–')}
            {fig('Dividend yield', s?.divYield != null ? `${s.divYield.toFixed(1)}%` : '–')}
            {fig('Market cap', s?.marketCap != null ? `Rs ${fmtCompact(s.marketCap)}` : '–')}
            {fig('52-week low', yr.length ? Math.min(...yr).toFixed(2) : '–')}
            {fig('52-week high', yr.length ? Math.max(...yr).toFixed(2) : '–')}
            {fig('Shariah', s ? (s.shariah ? (s.indexes.includes('KMI30') ? 'KMI-30' : 'Yes') : 'No') : '–')}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 13, color: C.gold }}>Sahm</T>
            <T style={{ fontSize: 10.5, color: C.faint }}>PSX prices · information, not advice</T>
          </View>
        </View>
        <Button label={busy ? 'Making the picture…' : 'Share the picture'} onPress={share} disabled={busy} />
        {msg ? (
          <T v="caption" style={{ color: colors.downText }}>
            {msg}
          </T>
        ) : null}
        <T v="caption" style={{ lineHeight: 17 }}>
          Nothing about your own holdings is on the card: only the stock's public figures.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    card: { borderRadius: 22, padding: 18 },
  }),
);
