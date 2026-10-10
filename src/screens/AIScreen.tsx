import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { fmtCompact, fmtPct } from '../format';
import { useMarket } from '../store/market';
import { Badge, Card, Icon, T } from '../ui/kit';

/**
 * Phase 1 shows a computed market snapshot. The AI chat (answers grounded in
 * PSX filings) needs an API key and arrives in Phase 2.
 */
export default function AIScreen() {
  const { stocks, indices } = useMarket();

  const snap = useMemo(() => {
    const traded = stocks.filter((s) => (s.volume ?? 0) > 0 && s.changePct != null);
    const up = traded.filter((s) => (s.changePct as number) > 0).length;
    const down = traded.filter((s) => (s.changePct as number) < 0).length;
    const flat = traded.length - up - down;
    const volume = traded.reduce((sum, s) => sum + (s.volume ?? 0), 0);
    const shariah = traded.filter((s) => s.shariah);
    const shUp = shariah.filter((s) => (s.changePct as number) > 0).length;
    const best = [...traded].filter((s) => (s.volume ?? 0) >= 100_000).sort((a, b) => (b.changePct as number) - (a.changePct as number))[0];
    const busiest = [...traded].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
    return { traded: traded.length, up, down, flat, volume, shariah: shariah.length, shUp, best, busiest };
  }, [stocks]);

  const kse = indices.find((i) => i.code === 'KSE100');
  const kmi = indices.find((i) => i.code === 'KMI30');
  const breadth = snap.traded ? (snap.up / snap.traded) * 100 : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.mark}>
            <Icon name="ai" size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="h1" style={{ fontSize: 20 }}>
              Sahm AI
            </T>
            <T v="caption">Market snapshot from today's PSX data</T>
          </View>
        </View>

        <Card style={{ gap: 12 }}>
          <T v="title" style={{ fontSize: 15 }}>
            Today at a glance
          </T>
          <T v="body" style={{ color: colors.text2 }}>
            {kse
              ? `KSE-100 is ${kse.changePct != null && kse.changePct >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(kse.changePct ?? 0), false)}`
              : 'Index data is loading'}
            {kmi ? `, KMI-30 ${kmi.changePct != null && kmi.changePct >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(kmi.changePct ?? 0), false)}.` : '.'}{' '}
            {snap.traded
              ? `${snap.up} of ${snap.traded} traded stocks rose, ${snap.down} fell. ${fmtCompact(snap.volume)} shares changed hands.`
              : ''}
          </T>
          {snap.traded ? (
            <View style={{ gap: 6 }}>
              <View style={styles.breadth}>
                <View style={{ flex: snap.up, backgroundColor: colors.up }} />
                <View style={{ flex: snap.flat, backgroundColor: colors.faint }} />
                <View style={{ flex: snap.down, backgroundColor: colors.down }} />
              </View>
              <T v="caption">
                ▲ {snap.up} advancing · {snap.flat} unchanged · ▼ {snap.down} declining ({breadth.toFixed(0)}% up)
              </T>
            </View>
          ) : null}
          {snap.best ? (
            <T v="caption" style={{ lineHeight: 18 }}>
              Biggest liquid gainer: {snap.best.symbol} {fmtPct(snap.best.changePct)}. Most traded: {snap.busiest?.symbol} (
              {fmtCompact(snap.busiest?.volume)} shares). Shariah stocks: {snap.shUp} of {snap.shariah} up.
            </T>
          ) : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="title" style={{ fontSize: 15 }}>
              Ask anything about PSX
            </T>
            <Badge label="Coming next" tone="gold" />
          </View>
          <T v="body" style={{ color: colors.text2 }}>
            Chat that answers questions like “why did LUCK fall today?” or “Shariah banks with dividend yield above 8%”,
            using PSX announcements and prices, with sources.
          </T>
          <T v="caption" style={{ lineHeight: 18 }}>
            This needs an AI API key on a small backend, which comes in Phase 2.
          </T>
        </Card>
        <T v="caption" style={{ lineHeight: 18 }}>
          Information, not investment advice.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 18, paddingBottom: 36 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  breadth: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surface2 },
});
