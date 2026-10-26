/** Set your own target weights; Sahm works out exactly which shares to buy (or sell) to get back to them, with the tax on any sale. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { markPlanDone, planDue, planPref, setPlan } from '../portfolio/monthlyPlan';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { normalise, rebalance, targetsPref } from '../portfolio/rebalance';
import { boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023, saleTax } from '../portfolio/tax';
import { Panel } from '../ui/bits';
import { Button, Empty, IconButton, Section, Segmented, T } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(Math.abs(v), 0)}`;
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function RebalanceScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const saved = targetsPref.use();
  const tax = taxStatusPref.use();
  const bought = boughtPref.use();
  const [mode, setMode] = useState<'cash' | 'both'>('cash');
  const route = useRoute<RouteProp<RootParams, 'Rebalance'>>();
  const plan = planPref.use();
  const due = planDue(plan);
  const fromParams = Number(route.params?.cash) || 0;
  const [cashText, setCashText] = useState(String(fromParams || (due ? plan.amount : 50000)));
  // the plan loads from the phone after the first draw: on plan day, start from its amount
  const [planApplied, setPlanApplied] = useState(false);
  React.useEffect(() => {
    if (!planApplied && due && !fromParams) {
      setCashText(String(plan.amount));
      setMode('cash');
      setPlanApplied(true);
    }
  }, [due, planApplied, fromParams, plan.amount]);
  const [extra, setExtra] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});

  const symbols = [...holdings.map((h) => h.symbol), ...extra.filter((s) => !holdings.some((h) => h.symbol === s))];
  const priceOf = (s: string) => bySymbol.get(s)?.price ?? null;
  const positions = symbols.map((s) => ({ symbol: s, shares: holdings.find((h) => h.symbol === s)?.shares ?? 0, price: priceOf(s) ?? 0 }));
  const missing = positions.filter((p) => !(p.price > 0)).map((p) => p.symbol);
  const value = positions.reduce((a, p) => a + p.shares * p.price, 0);
  const now = Object.fromEntries(positions.map((p) => [p.symbol, value > 0 ? (p.shares * p.price) / value : 0]));
  const hasTargets = symbols.some((s) => (saved[s] ?? 0) > 0);
  const targets: Record<string, number> = hasTargets ? saved : Object.fromEntries(symbols.map((s) => [s, Math.round(now[s] * 1000) / 10]));
  const sum = symbols.reduce((a, s) => a + (targets[s] ?? 0), 0);
  const w = normalise(targets, symbols);
  const cash = mode === 'cash' || cashText.trim() ? Math.max(0, Number(cashText.replace(/[^\d.]/g, '')) || 0) : 0;

  const result = useMemo(
    () => (missing.length || !positions.length ? null : rebalance(positions, targets, cash, mode === 'both')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(positions), JSON.stringify(targets), cash, mode, missing.length],
  );

  const setTarget = (s: string, text: string) => {
    setDraft((d) => ({ ...d, [s]: text }));
    const v = Number(text.replace(/[^\d.]/g, ''));
    if (text.trim() === '' || Number.isFinite(v)) targetsPref.set({ ...targets, [s]: text.trim() === '' ? 0 : v });
  };
  const preset = (kind: 'equal' | 'now') => {
    setDraft({});
    targetsPref.set(Object.fromEntries(symbols.map((s) => [s, kind === 'equal' ? Math.round((1000 / symbols.length)) / 10 : Math.round(now[s] * 1000) / 10])));
  };
  const found = useMemo(() => {
    const u = q.trim().toUpperCase();
    if (!u) return [];
    return stocks.filter((s) => !symbols.includes(s.symbol) && (s.symbol.includes(u) || s.name.toUpperCase().includes(u))).sort((a, b) => (a.symbol === u ? -1 : b.symbol === u ? 1 : (b.marketCap ?? 0) - (a.marketCap ?? 0))).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, q, symbols.join()]);

  const buys = result?.trades.filter((t) => t.shares > 0) ?? [];
  const sells = result?.trades.filter((t) => t.shares < 0) ?? [];
  const sellTax = sells.map((t) => {
    const h = holdings.find((x) => x.symbol === t.symbol);
    return h ? saleTax(-t.shares, t.price, h.avgCost, tax, bought[t.symbol] ?? 'recent', heldSince2023()) : null;
  });
  const totalTax = sellTax.reduce((a, x) => a + (x?.tax ?? 0), 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Rebalance
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings first, then set how much of your money each should be." />
        ) : (
          <>
            <Section title="Your targets">
              <Panel style={{ paddingVertical: 6 }}>
                <View style={[styles.row, styles.border]}>
                  <T v="label" style={{ flex: 1 }}>
                    Stock
                  </T>
                  <T v="label" style={{ width: 64, textAlign: 'right' }}>
                    Now
                  </T>
                  <T v="label" style={{ width: 84, textAlign: 'right' }}>
                    Target %
                  </T>
                </View>
                {symbols.map((s, i) => (
                  <View key={s} style={[styles.row, i < symbols.length - 1 && styles.border]}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{s}</T>
                      {!holdings.some((h) => h.symbol === s) ? (
                        <Pressable onPress={() => (setExtra((e) => e.filter((x) => x !== s)), targetsPref.set({ ...targets, [s]: 0 }))} hitSlop={6}>
                          <T v="caption">new · remove</T>
                        </Pressable>
                      ) : null}
                    </View>
                    <T v="mono" style={{ width: 64, textAlign: 'right', fontSize: 13.5, color: colors.text2 }}>
                      {pc(now[s] ?? 0)}
                    </T>
                    <View style={{ width: 84, alignItems: 'flex-end' }}>
                      <TextInput
                        value={draft[s] ?? String(targets[s] ?? 0)}
                        onChangeText={(t) => setTarget(s, t)}
                        keyboardType="numeric"
                        style={styles.pct}
                        accessibilityLabel={`Target for ${s}`}
                      />
                    </View>
                  </View>
                ))}
              </Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T v="caption" style={{ flex: 1, color: Math.abs(sum - 100) > 0.5 ? colors.gold : colors.faint }}>
                  {Math.abs(sum - 100) > 0.5 ? `Adds up to ${sum.toFixed(1)}%: scaled to 100%` : 'Adds up to 100%'}
                </T>
                <Button label="Equal" small tone="ghost" onPress={() => preset('equal')} />
                <Button label="Like now" small tone="ghost" onPress={() => preset('now')} />
              </View>
              <TextInput value={q} onChangeText={setQ} autoCapitalize="characters" autoCorrect={false} placeholder="Add a stock you don't own yet" placeholderTextColor={colors.faint} style={styles.input} />
              {found.map((s) => (
                <Pressable key={s.symbol} accessibilityRole="button" onPress={() => (setExtra((e) => [...e, s.symbol]), setQ(''))} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
                  <T style={{ fontFamily: fonts.bold, width: 70 }}>{s.symbol}</T>
                  <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
                    {s.name}
                  </T>
                  <T style={{ color: colors.gold, fontFamily: fonts.bold }}>+</T>
                </Pressable>
              ))}
            </Section>

            <PlanBox />
            {due ? (
              <Panel style={{ paddingVertical: 12, gap: 8, borderColor: colors.up, borderWidth: 1 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>This month's Rs {fmtNum(plan.amount, 0)}</T>
                <T v="caption" style={{ lineHeight: 17 }}>
                  The list below shows what to buy with it. Once you've placed the orders, mark the month done and record the buys in Edit holdings.
                </T>
                <Button label="I've invested this month" small onPress={() => markPlanDone()} />
              </Panel>
            ) : null}

            <Section title="How">
              <Segmented
                options={[
                  { key: 'cash', label: 'New money only' },
                  { key: 'both', label: 'Buy and sell' },
                ]}
                value={mode}
                onChange={setMode}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T v="body" style={{ flex: 1, color: colors.text2 }}>
                  {mode === 'cash' ? 'Cash to invest' : 'New cash too (optional)'}
                </T>
                <TextInput value={cashText} onChangeText={setCashText} keyboardType="numeric" style={styles.amount} accessibilityLabel="Cash to invest" />
              </View>
            </Section>

            {missing.length ? (
              <T v="caption">Waiting for prices of {missing.join(', ')}…</T>
            ) : result ? (
              <Section title="What to do">
                <Panel style={{ paddingVertical: 6 }}>
                  {!result.trades.length ? (
                    <T v="caption" style={{ paddingVertical: 10 }}>
                      {mode === 'cash' && !cash ? 'Enter the cash you want to invest.' : 'Nothing to do: you are already within a share of every target.'}
                    </T>
                  ) : (
                    [...sells, ...buys].map((t, i, list) => {
                      const st = t.shares < 0 ? sellTax[sells.indexOf(t)] : null;
                      return (
                        <View key={t.symbol} style={[{ paddingVertical: 10, gap: 3 }, i < list.length - 1 && styles.border]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <T style={{ fontFamily: fonts.heavy, fontSize: 13, color: t.shares > 0 ? colors.up : colors.downText, width: 38 }}>{t.shares > 0 ? 'BUY' : 'SELL'}</T>
                            <T style={{ fontFamily: fonts.bold, fontSize: 14.5, flex: 1 }}>
                              {fmtNum(Math.abs(t.shares), 0)} {t.symbol}
                            </T>
                            <T v="mono" style={{ fontSize: 14 }}>
                              {rs(t.value)}
                            </T>
                          </View>
                          <T v="caption">
                            at about Rs {t.price.toFixed(2)} · {pc(now[t.symbol] ?? 0)} → {pc(result.after[t.symbol] ?? 0)} (target {pc(w[t.symbol] ?? 0)})
                            {st ? ` · ${st.gain > 0 ? `tax about ${rs(st.tax)}` : 'a loss, so no tax'}` : ''}
                          </T>
                        </View>
                      );
                    })
                  )}
                </Panel>
                {result.trades.length ? (
                  <View style={{ gap: 4 }}>
                    {sells.length ? <Line label="From selling" value={rs(sells.reduce((a, t) => a - t.value, 0))} /> : null}
                    {sells.length ? <Line label="Capital gains tax on the sales" value={rs(totalTax)} /> : null}
                    <Line label="Spent on buying" value={rs(buys.reduce((a, t) => a + t.value, 0))} />
                    <Line label="Cash left over" value={rs(result.leftover)} />
                    <Line label="Furthest from a target after this" value={`${result.maxGap.toFixed(1)} points`} />
                  </View>
                ) : null}
                <T v="caption" style={{ lineHeight: 18 }}>
                  Whole shares at today's prices. Brokerage (about 0.15%) and the small PSX charges aren't included.
                  {sells.length && totalTax > 0 ? ` Keep about ${rs(totalTax)} aside: the tax on the sales is collected from your broker account (Tax & zakat shows your year so far).` : ''}{' '}
                  Information, not advice.
                </T>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <T v="body" style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 14 }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 18 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    pct: { width: 72, height: 38, borderRadius: 9, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontSize: 14, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
    input: { height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15, color: colors.text, fontFamily: fonts.regular },
    amount: { width: 130, height: 42, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontSize: 15, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
  }),
);

/** The monthly plan: amount and day, with a reminder on that day. */
function PlanBox() {
  const plan = planPref.use();
  const [amt, setAmt] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <Section title="Monthly plan">
      <Panel style={{ paddingVertical: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T v="body" style={{ flex: 1 }}>
            Remind me every month
          </T>
          <Switch value={plan.on} onValueChange={(on) => setPlan({ ...plan, on })} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
        </View>
        {plan.on ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T v="body" style={{ flex: 1, color: colors.text2 }}>
                Amount (Rs)
              </T>
              <TextInput
                value={amt ?? String(plan.amount)}
                onChangeText={setAmt}
                onBlur={() => {
                  const v = Number((amt ?? '').replace(/[^\d]/g, ''));
                  if (v > 0) setPlan({ ...plan, amount: v });
                  setAmt(null);
                }}
                keyboardType="numeric"
                style={styles.amount}
                accessibilityLabel="Monthly amount"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T v="body" style={{ flex: 1, color: colors.text2 }}>
                Day of the month (1–28)
              </T>
              <TextInput
                value={day ?? String(plan.day)}
                onChangeText={setDay}
                onBlur={() => {
                  const v = Math.round(Number(day));
                  if (v >= 1 && v <= 28) setPlan({ ...plan, day: v });
                  setDay(null);
                }}
                keyboardType="numeric"
                style={[styles.amount, { width: 70 }]}
                accessibilityLabel="Day of the month"
              />
            </View>
            <T v="caption" style={{ lineHeight: 17 }}>
              On that day (the next trading day if the market is shut) your phone reminds you, and this screen shows what to buy with it from your
              targets above.
            </T>
          </>
        ) : null}
      </Panel>
    </Section>
  );
}
