/** Before you sell: in hand after charges and tax, against holding through the next dividend. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { costsPref } from '../portfolio/costs';
import { boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023 } from '../portfolio/tax';
import { dividendTaxRate, exDate, payerKind, upcomingPayout } from '../analysis/dividends';
import { portion, sellPlan, type SaleOutcome } from '../portfolio/sellPlan';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Explain } from '../ui/Explain';
import { Empty, IconButton, Section, T } from '../ui/kit';

const rs = (v: number) => `${v < 0 ? '−' : ''}Rs ${fmtNum(Math.abs(Math.round(v)), 0)}`;

function Lines({ o, shares }: { o: SaleOutcome; shares: number }) {
  const row = (k: string, v: string, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} key={k}>
      <T v="caption">{k}</T>
      <T v="mono" style={{ fontSize: 13.5, color: color ?? colors.text }}>
        {v}
      </T>
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      {row(`${fmtNum(shares, 0)} shares at Rs ${o.price.toFixed(2)}`, rs(o.proceeds))}
      {row('Trading charges', `−${rs(o.costs)}`)}
      {row(o.gain >= 0 ? `Capital gains tax (${(o.rate * 100).toFixed(1).replace(/\.0$/, '')}%)` : 'Loss, so no tax', o.tax ? `−${rs(o.tax)}` : 'Rs 0')}
      {o.dividend ? row('Dividend after tax', `+${rs(o.dividend)}`, colors.up) : null}
      <View style={styles.hair} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>In hand</T>
        <T v="mono" style={{ fontSize: 17, color: colors.gold }}>
          {rs(o.inHand)}
        </T>
      </View>
      <T v="caption" style={{ fontSize: 11.5 }}>
        {o.gain >= 0 ? `Gain ${rs(o.gain)} on what you paid` : `Loss ${rs(-o.gain)}: it can be set against tax on other share gains this tax year`}
      </T>
    </View>
  );
}

export default function SellPlanScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootParams, 'SellPlan'>>();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const status = taxStatusPref.use();
  const bought = boughtPref.use();
  const costs = costsPref.use();
  const [symbol, setSymbol] = useState<string | null>(route.params?.symbol ?? null);
  useEffect(() => {
    if (!symbol && rows.length) setSymbol(rows[0].holding.symbol);
  }, [rows, symbol]);
  const r = rows.find((x) => x.holding.symbol === symbol) ?? null;
  const [sharesText, setSharesText] = useState('');
  const [priceText, setPriceText] = useState('');
  useEffect(() => {
    if (!r) return;
    setSharesText(String(r.holding.shares));
    setPriceText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.holding.symbol]);

  const shares = Math.min(r?.holding.shares ?? 0, Math.max(0, Math.floor(Number(sharesText) || 0)));
  const price = Number(priceText.replace(',', '.')) > 0 ? Number(priceText.replace(',', '.')) : (r?.price ?? 0);
  const plan = useMemo(() => {
    if (!r) return null;
    const up = upcomingPayout(r.dividends);
    const b = bought[r.holding.symbol] ?? 'recent';
    return sellPlan({
      shares,
      price,
      avgCost: r.holding.avgCost,
      status,
      bought: b,
      heldYears: b === '2022-24' ? heldSince2023() : 0,
      costs,
      payout: up && up.dps > 0 && exDate(up.bookClosure) > Date.now() ? { dps: up.dps, bookClosure: up.bookClosure, exDate: exDate(up.bookClosure) } : null,
      divRate: dividendTaxRate(status, payerKind(r.stock?.sector)),
    });
  }, [r, shares, price, status, bought, costs]);
  const qualified = (() => {
    const up = r ? upcomingPayout(r.dividends) : null;
    return up && up.dps > 0 && exDate(up.bookClosure) <= Date.now() ? up : null;
  })();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Plan a sale
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to plan a sale." />
        ) : loading && !rows.length ? (
          <Skeleton kind="cards" n={2} />
        ) : !r ? null : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {rows.map((x) => {
                const on = x.holding.symbol === symbol;
                return (
                  <Pressable key={x.holding.symbol} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setSymbol(x.holding.symbol)} style={[styles.chip, on && styles.chipOn]}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 13, color: on ? colors.onGold : colors.text2 }}>{x.holding.symbol}</T>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Panel style={{ paddingVertical: 12, gap: 10 }}>
              <T v="caption">
                You hold {fmtNum(r.holding.shares, 0)} at an average of Rs {r.holding.avgCost.toFixed(2)}; it's Rs {r.price.toFixed(2)} now.
              </T>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T v="caption">Shares to sell</T>
                  <TextInput value={sharesText} onChangeText={setSharesText} keyboardType="number-pad" style={styles.input} accessibilityLabel="Shares to sell" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T v="caption">At price</T>
                  <TextInput
                    value={priceText}
                    onChangeText={setPriceText}
                    keyboardType="decimal-pad"
                    placeholder={r.price.toFixed(2)}
                    placeholderTextColor={colors.faint}
                    style={styles.input}
                    accessibilityLabel="Sale price"
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  ['A quarter', 0.25],
                  ['Half', 0.5],
                  ['All', 1],
                ].map(([l, f]) => (
                  <Pressable key={l as string} accessibilityRole="button" onPress={() => setSharesText(String(portion(r.holding.shares, f as number)))} style={styles.fchip}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.text2 }}>{l as string}</T>
                  </Pressable>
                ))}
              </View>
            </Panel>

            {plan ? (
              <>
                <Section title="Sell now" extra={<Explain id="cgt" />}>
                  <Panel style={{ paddingVertical: 14 }}>
                    <Lines o={plan.now} shares={shares} />
                  </Panel>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    To get back what these shares cost after charges and tax, sell at Rs {plan.evenPrice.toFixed(2)} or more.
                  </T>
                </Section>

                {plan.wait ? (
                  <Section title="Or hold through the dividend" extra={<Explain id="bookClosure" />}>
                    <Panel style={{ paddingVertical: 14, gap: 10 }}>
                      <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                        Rs {plan.wait.dps.toFixed(2)} a share, book closure {fmtDay(plan.wait.bookClosure)}. Keep the shares until the ex-date ({fmtDay(plan.wait.sellFrom)}), then sell. The price usually drops by about
                        the dividend that morning, so this assumes Rs {plan.wait.price.toFixed(2)}.
                      </T>
                      <Lines o={plan.wait} shares={shares} />
                      <T style={{ fontFamily: fonts.bold, fontSize: 14, color: plan.wait.diff >= 0 ? colors.up : colors.downText }}>
                        {Math.abs(plan.wait.diff) < 50
                          ? 'About the same either way.'
                          : plan.wait.diff > 0
                            ? `About ${rs(plan.wait.diff)} more by waiting.`
                            : `About ${rs(-plan.wait.diff)} less by waiting (the dividend's tax is more than the capital gains tax it saves).`}
                      </T>
                    </Panel>
                    <T v="caption" style={{ lineHeight: 17 }}>
                      The price on the day can move by much more than the dividend in either direction; this only compares the tax and charges.
                    </T>
                  </Section>
                ) : qualified ? (
                  <T v="caption" style={{ lineHeight: 17 }}>
                    You already qualify for the Rs {qualified.dps.toFixed(2)} dividend (book closure {fmtDay(qualified.bookClosure)}): it's paid to you even if you sell now.
                  </T>
                ) : (
                  <T v="caption">No cash dividend announced for {r.holding.symbol} right now.</T>
                )}
                <T v="caption" style={{ lineHeight: 17 }}>
                  Tax uses your status ({status === 'filer' ? 'filer' : 'non-filer'}) and when you bought (Settings → Tax). Charges use your broker's rate (Settings → Trading costs). Estimates; the broker's contract note
                  is final.
                </T>
              </>
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
    chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    chipOn: { backgroundColor: colors.gold },
    fchip: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    input: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingHorizontal: 12 },
    hair: { height: 1, backgroundColor: colors.hairline },
  }),
);
