import React, { useEffect, useMemo, useState } from 'react';
import { tt, useLang } from '../i18n';
import { useFlag } from '../flags';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { TabParams } from '../nav/types';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, themed } from '../theme';
import { fmtNum, fmtPct, fmtPkr, fmtPrice, fmtSigned } from '../format';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { valuePortfolio } from '../paper/engine';
import { shortSector } from '../sectors';
import { Badge, Button, Card, Empty, Segmented, T } from '../ui/kit';
import { useHoldings } from '../portfolio/holdings';
import { portfoliosPref } from '../portfolio/portfolios';
import { MyHoldings } from './portfolio/MyHoldings';
import { SectorMix } from '../ui/SectorMix';

function PaperPortfolio() {
  const nav = useNavigation();
  const { bySymbol } = useMarket();
  const { account, resetAccount } = useUser();
  const val = valuePortfolio(account, (s) => bySymbol.get(s));

  const holdings = useMemo(
    () =>
      Object.entries(account.positions)
        .map(([symbol, p]) => {
          const s = bySymbol.get(symbol);
          const price = s?.price ?? p.avgCost;
          const value = price * p.qty;
          return {
            symbol,
            name: s?.name ?? symbol,
            sector: s?.sector ?? 'Other',
            shariah: s?.shariah ?? false,
            qty: p.qty,
            avg: p.avgCost,
            price,
            value,
            pnl: value - p.avgCost * p.qty,
            pnlPct: p.avgCost > 0 ? ((price - p.avgCost) / p.avgCost) * 100 : 0,
          };
        })
        .sort((a, b) => b.value - a.value),
    [account.positions, bySymbol],
  );

  const confirmReset = () =>
    Alert.alert('Reset paper account?', 'All holdings, orders and history are cleared and you start again with PKR 1,000,000.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAccount },
    ]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.between}>
          <T v="caption">Practice money, not your real account.</T>
          <Badge label={tt("Paper account")} tone="gold" />
        </View>

        <Card style={styles.summary}>
          <View style={{ width: '100%', gap: 2 }}>
            <T v="caption" style={{ color: colors.muted }}>
              Total value
            </T>
            <T v="monoXl">{fmtPkr(val.total)}</T>
          </View>
          <Metric label="Unrealised P&L" value={`${fmtSigned(val.unrealized, 0)} (${fmtPct(val.unrealizedPct)})`} color={changeColor(val.unrealized)} />
          <Metric label={tt("Today")} value={fmtSigned(val.dayChange, 0)} color={changeColor(val.dayChange)} />
          <Metric label="Realised P&L" value={fmtSigned(account.realized, 0)} color={changeColor(account.realized)} />
          <Metric label={tt("Total return")} value={fmtPct(val.totalReturnPct)} color={changeColor(val.totalReturn)} />
          <Metric label={tt("Invested")} value={fmtNum(val.holdingsValue, 0)} />
          <Metric label={tt("Cash")} value={fmtNum(account.cash, 0)} />
        </Card>

        {holdings.length === 0 ? (
          <Card>
            <Empty title="No holdings yet" body="You have PKR 1,000,000 of practice money. Find a stock in Market and tap Buy." />
            <Button label="Browse the market" onPress={() => nav.navigate('Tabs', { screen: 'Market' })} />
          </Card>
        ) : (
          <>
            <SectorMix items={holdings.map((h) => ({ sector: h.sector ?? 'Other', value: h.value, shariah: h.shariah }))} />

            <View>
              <View style={[styles.between, { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.hairline }]}>
                <T v="label">Holding</T>
                <T v="label">Value and P&L</T>
              </View>
              {holdings.map((h) => (
                <Pressable
                  key={h.symbol}
                  accessibilityRole="button"
                  onPress={() => nav.navigate('Stock', { symbol: h.symbol })}
                  style={styles.holding}
                >
                  <View style={{ gap: 2, flex: 1 }}>
                    <T v="title" style={{ fontSize: 15 }}>
                      {h.symbol}
                    </T>
                    <T v="caption" style={{ fontFamily: fonts.mono }}>
                      {fmtNum(h.qty, 0)} shares, avg {fmtPrice(h.avg)}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <T v="mono">{fmtNum(h.value, 0)}</T>
                    <T v="mono" style={{ fontSize: 12, color: changeColor(h.pnl) }}>
                      {fmtSigned(h.pnl, 0)} ({fmtPct(h.pnlPct)})
                    </T>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Button label="Reset paper account" tone="ghost" small onPress={confirmReset} />
        <T v="caption" style={{ lineHeight: 18 }}>
          Practice account with virtual money. Commission is a {`0.15%`} estimate per trade; real broker fees and taxes
          differ. Live trading arrives when a licensed broker partner is connected.
        </T>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ width: '50%', gap: 2, marginTop: 10 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 13, color: color ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

export default function PortfolioScreen() {
  useLang();
  const { holdings, loaded } = useHoldings();
  const nav = useNavigation();
  const route = useRoute<RouteProp<TabParams, 'Portfolio'>>();
  const [tab, setTab] = useState<'real' | 'paper'>('real');
  const practiceOn = useFlag('practice');
  const [view, setView] = useState<'holdings' | 'invest' | 'risk' | undefined>(undefined);
  // opened from a tile, menu or link that names a part of the portfolio
  useEffect(() => {
    const p = route.params;
    if (!p?.tab && !p?.view) return;
    if (p.tab) setTab(p.tab);
    if (p.view) {
      setTab('real');
      setView(p.view);
    }
    nav.setParams({ tab: undefined, view: undefined } as never);
  }, [route.params, nav]);
  const pfs = portfoliosPref.use();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="h1">{tt('Portfolio')}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Family portfolios" hitSlop={8} onPress={() => nav.navigate('Portfolios')} style={styles.pf}>
            <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.text2 }}>{pfs.list.length > 1 ? `${pfs.list.find((x) => x.id === pfs.active)?.name ?? 'Mine'} ▾` : '👪 Family'}</T>
          </Pressable>
        </View>
        {practiceOn ? (
          <Segmented
            options={[
              { key: 'real', label: `${tt('My holdings')}${loaded && holdings.length ? ` (${holdings.length})` : ''}` },
              { key: 'paper', label: tt("Practice") },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : null}
      </View>
      {tab === 'real' || !practiceOn ? <MyHoldings view={view} onView={setView} /> : <PaperPortfolio />}
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  pf: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: "center" },
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 22, paddingBottom: 36 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { flexDirection: 'row', flexWrap: 'wrap' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.shariah },
  holding: { flexDirection: 'row', alignItems: 'center', minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.hairline },
}));
