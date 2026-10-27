/** Where your gains came from: price rises, dividends, and what the dividends you put back into shares are worth now. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { tradesPref } from '../portfolio/trades';
import { taxStatusPref } from '../portfolio/prefs';
import { snapshots, type Snap } from '../portfolio/track';
import { sharesFromTrades, snapshotLookup } from '../portfolio/taxStatement';
import { dividendsReceived } from '../portfolio/shariah';
import { dividendTaxRate, payerKind } from '../analysis/dividends';
import { growthSources, type DividendIn } from '../portfolio/growthSources';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, T } from '../ui/kit';

const rs = (v: number) => `${v < 0 ? '−' : ''}Rs ${fmtNum(Math.abs(Math.round(v)), 0)}`;
const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export default function GrowthScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const status = taxStatusPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const today = pkDay(Date.now());
  // from the first record, and at least a year back (before Sahm knew, today's shares are assumed)
  const start = useMemo(() => {
    const yearAgo = pkDay(Date.now() - 365 * 864e5);
    const first = [...trades.map((t) => t.day), ...(snaps ?? []).map((s) => s.day)].sort()[0];
    return first && first < yearAgo ? first : yearAgo;
  }, [trades, snaps]);

  const g = useMemo(() => {
    if (!snaps) return null;
    const fromSnaps = snapshotLookup(snaps);
    const divs: DividendIn[] = [];
    for (const r of rows) {
      const sym = r.holding.symbol;
      const rate = dividendTaxRate(status, payerKind(r.stock?.sector));
      const got = dividendsReceived(r.dividends?.list ?? [], (day) => sharesFromTrades(trades, sym, day, r.holding.shares) ?? fromSnaps(sym, day) ?? r.holding.shares, start, today);
      for (const p of got.payments) divs.push({ day: p.day, symbol: sym, amount: p.amount * (1 - rate) });
    }
    return growthSources({
      holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, avgCost: r.holding.avgCost, price: r.price })),
      trades,
      dividends: divs,
    });
  }, [rows, trades, snaps, status, start, today]);

  const total = g ? g.priceNow + g.priceSold + g.dividends : 0;
  const parts = g
    ? [
        { k: 'Price, on what you hold', v: g.priceNow, c: colors.gold },
        { k: 'Price, on what you sold', v: g.priceSold, c: colors.shariah },
        { k: 'Dividends (after tax)', v: g.dividends, c: colors.up },
      ]
    : [];
  const pos = parts.reduce((a, p) => a + Math.max(0, p.v), 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Where gains came from
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loaded && !holdings.length && !trades.length ? (
          <Empty title="Nothing yet" body="Add your holdings to see how much of your gain is price and how much is dividends." />
        ) : !g || (loading && !rows.length) ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          <>
            <Panel style={{ paddingVertical: 14, gap: 10 }}>
              <T v="caption">Total gain</T>
              <T v="mono" style={{ fontSize: 26, color: total >= 0 ? colors.up : colors.downText }}>
                {rs(total)}
              </T>
              {pos > 0 ? (
                <View style={styles.bar}>
                  {parts
                    .filter((p) => p.v > 0)
                    .map((p) => (
                      <View key={p.k} style={{ flex: p.v / pos, backgroundColor: p.c }} />
                    ))}
                </View>
              ) : null}
              {parts.map((p) => (
                <View key={p.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.c }} />
                  <T style={{ flex: 1, fontSize: 14 }}>{p.k}</T>
                  <T v="mono" style={{ fontSize: 14, color: p.v < 0 ? colors.downText : colors.text }}>
                    {rs(p.v)}
                  </T>
                </View>
              ))}
              <T v="caption" style={{ lineHeight: 17 }}>
                Dividends counted from {fmtDay(Date.parse(start + 'T12:00:00Z'))}, on the shares you held then (from your recorded trades or Sahm's daily snapshot; before those, today's shares). Price gains on what you hold are against your average
                cost.
              </T>
            </Panel>

            <Section title="Dividends put back to work">
              <Panel style={{ paddingVertical: 14, gap: 8 }}>
                {g.dividends <= 0 ? (
                  <T v="caption">No dividends received in this period yet.</T>
                ) : trades.some((t) => t.side === 'buy') ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <View style={{ flex: 1 }}>
                        <T v="caption">Reinvested</T>
                        <T v="mono" style={{ fontSize: 19 }}>
                          {rs(g.reinvested)}
                        </T>
                        <T v="caption">{g.dividends ? ((g.reinvested / g.dividends) * 100).toFixed(0) : 0}% of dividends</T>
                      </View>
                      <View style={{ flex: 1 }}>
                        <T v="caption">Worth now</T>
                        <T v="mono" style={{ fontSize: 19, color: g.reinvestedNow >= g.reinvested ? colors.up : colors.downText }}>
                          {rs(g.reinvestedNow)}
                        </T>
                        <T v="caption">{g.reinvested ? `${g.reinvestedNow >= g.reinvested ? '+' : ''}${((g.reinvestedNow / g.reinvested - 1) * 100).toFixed(1)}%` : ''}</T>
                      </View>
                    </View>
                    <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                      {g.unspent > 1 ? `${rs(g.unspent)} of dividend cash hasn't gone back into shares yet. Putting it to work is how dividends compound.` : 'All your dividend cash went back into shares.'}
                    </T>
                    {Object.keys(g.fromDividends).length ? (
                      <T v="caption" style={{ lineHeight: 17 }}>
                        Bought with dividends:{' '}
                        {Object.entries(g.fromDividends)
                          .filter(([, n]) => n >= 0.5)
                          .map(([s, n]) => `${fmtNum(Math.round(n), 0)} ${s}`)
                          .join(', ')}
                      </T>
                    ) : null}
                  </>
                ) : (
                  <T v="caption" style={{ lineHeight: 18 }}>
                    Record your buys with "Bought or sold" and Sahm will count each one as using your dividend cash first, to show how much went back into shares and what it's worth now.
                  </T>
                )}
              </Panel>
            </Section>

            {Object.keys(g.bySymbol).length ? (
              <Section title="Dividends by stock">
                <Panel style={{ paddingVertical: 4 }}>
                  {Object.entries(g.bySymbol)
                    .sort((a, b) => b[1] - a[1])
                    .map(([s, v], i, all) => (
                      <View key={s} style={[styles.row, i < all.length - 1 && styles.border]}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>{s}</T>
                        <T v="mono" style={{ fontSize: 14 }}>
                          {rs(v)}
                        </T>
                      </View>
                    ))}
                </Panel>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
