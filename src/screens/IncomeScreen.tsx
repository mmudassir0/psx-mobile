/** Your dividend income for the next 12 months, month by month, and which steady payers would raise it. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { incomeIdeas, incomePlan } from '../portfolio/income';
import { payMonths } from '../portfolio/income';
import { benchmarkPref, taxStatusPref } from '../portfolio/prefs';
import { dividendTaxRate, payerKind } from '../analysis/dividends';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, T } from '../ui/kit';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const rs = (v: number) => `Rs ${fmtNum(v, 0)}`;

export default function IncomeScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading, total } = useReviews(holdings, stocks, bySymbol, null);
  const tax = taxStatusPref.use();
  const bench = benchmarkPref.use();
  const [amountText, setAmountText] = useState('100000');
  const [open, setOpen] = useState<string | null>(null);

  const plan = useMemo(
    () => (loading ? null : incomePlan(rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, sector: r.stock?.sector ?? null, dividends: r.dividends })), tax)),
    [rows, loading, tax],
  );
  const cost = rows.reduce((a, r) => a + r.holding.shares * r.holding.avgCost, 0);
  const ideas = useMemo(() => incomeIdeas(stocks, new Set(holdings.map((h) => h.symbol)), bench === 'KMI30'), [stocks, holdings, bench]);
  const amount = Math.max(0, Number(amountText.replace(/[^\d.]/g, '')) || 0);
  const maxMonth = plan ? Math.max(1, ...plan.months.map((m) => m.net)) : 1;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Dividend income
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to see the dividends they should pay over the next year." />
        ) : !plan ? (
          <Skeleton kind="cards" n={2} label="Reading each company's dividend history" />
        ) : (
          <>
            <Panel style={{ paddingVertical: 16, gap: 6 }}>
              <T v="caption">Next 12 months, after tax</T>
              <T v="monoLg" style={{ fontSize: 30 }}>
                {rs(plan.net)}
              </T>
              <T v="caption" style={{ lineHeight: 18 }}>
                About {rs(plan.net / 12)} a month on average · {rs(plan.gross)} before tax ({tax === 'filer' ? 'filer' : 'non-filer'} rates)
              </T>
              <View style={{ flexDirection: 'row', gap: 22, marginTop: 6 }}>
                <View>
                  <T v="caption">On today's value</T>
                  <T v="mono">{total > 0 ? `${((plan.net / total) * 100).toFixed(1)}%` : '–'}</T>
                </View>
                <View>
                  <T v="caption">On what you paid</T>
                  <T v="mono">{cost > 0 ? `${((plan.net / cost) * 100).toFixed(1)}%` : '–'}</T>
                </View>
              </View>
            </Panel>

            <Panel style={{ paddingVertical: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }}>
                {plan.months.map((m) => {
                  const h = (m.net / maxMonth) * 100;
                  const k = m.net ? (m.known / m.net) * h : 0;
                  return (
                    <Pressable key={m.month} accessibilityRole="button" accessibilityLabel={`${label(m.month)} ${rs(m.net)}`} onPress={() => setOpen(open === m.month ? null : m.month)} style={{ flex: 1, height: 120, justifyContent: 'flex-end' }}>
                      <View style={{ height: Math.max(m.net ? 3 : 1, h - k), backgroundColor: m.net ? colors.goldSoft : colors.hairline, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: m.net ? 1 : 0, borderColor: colors.gold, borderBottomWidth: 0, borderStyle: 'dashed' }} />
                      {k > 0 ? <View style={{ height: k, backgroundColor: colors.gold }} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {plan.months.map((m, i) => (
                  <T key={m.month} v="caption" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>
                    {i % 2 === 0 ? label(m.month).slice(0, 3) : ''}
                  </T>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Key fill={colors.gold} text="Announced" />
                <Key fill={colors.goldSoft} border text="Expected from last year" />
              </View>
            </Panel>

            {rows.some((r) => (r.dividends?.list ?? []).some((x) => x.dps > 0)) ? (
              <Section title="Who usually pays when">
                <Panel style={{ paddingVertical: 10, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 62 }} />
                    {MONTH.map((m) => (
                      <T key={m} v="caption" style={{ flex: 1, textAlign: 'center', fontSize: 9.5 }}>
                        {m.slice(0, 1)}
                      </T>
                    ))}
                  </View>
                  {rows
                    .filter((r) => (r.dividends?.list ?? []).some((x) => x.dps > 0))
                    .map((r) => {
                      const pm = payMonths(r.dividends?.list ?? []);
                      return (
                        <View key={r.holding.symbol} style={{ flexDirection: 'row', alignItems: 'center', height: 22 }}>
                          <T style={{ width: 62, fontFamily: fonts.bold, fontSize: 12 }} numberOfLines={1}>
                            {r.holding.symbol}
                          </T>
                          {MONTH.map((m, i) => {
                            const n = pm.get(i) ?? 0;
                            return (
                              <View key={m} style={{ flex: 1, alignItems: 'center' }}>
                                <View style={{ width: n ? 12 : 4, height: n ? 12 : 4, borderRadius: 6, backgroundColor: n >= 3 ? colors.gold : n === 2 ? colors.gold : n === 1 ? colors.goldSoft : colors.hairline, borderWidth: n === 1 ? 1 : 0, borderColor: colors.gold, opacity: n === 2 ? 0.75 : 1 }} />
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  <T v="caption" style={{ lineHeight: 17 }}>
                    Months each holding's book closure fell in over the last three years: a full dot every year, a lighter one in some years. Payment usually follows within a few weeks.
                  </T>
                </Panel>
              </Section>
            ) : null}

            <Section title="Month by month">
              <Panel style={{ paddingVertical: 4 }}>
                {plan.months.filter((m) => m.net > 0).length === 0 ? (
                  <T v="caption" style={{ paddingVertical: 12 }}>
                    None of your holdings paid a cash dividend in the last year.
                  </T>
                ) : (
                  plan.months
                    .filter((m) => m.net > 0)
                    .map((m, i, list) => (
                      <View key={m.month} style={[{ paddingVertical: 10, gap: 6 }, i < list.length - 1 && styles.border]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <T style={{ fontFamily: fonts.bold, fontSize: 14.5, flex: 1 }}>{label(m.month).replace(' ', ' 20')}</T>
                          <T v="mono" style={{ fontSize: 14.5 }}>
                            {rs(m.net)}
                          </T>
                        </View>
                        {plan.items
                          .filter((it) => it.month === m.month)
                          .map((it, k) => (
                            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <T style={{ fontFamily: fonts.semibold, fontSize: 13, width: 70 }}>{it.symbol}</T>
                              <T v="caption" style={{ flex: 1 }}>
                                Rs {it.dps.toFixed(2)} × {fmtNum(it.shares, 0)} · {it.known ? `announced, about ${fmtDay(it.t)}` : 'expected'}
                              </T>
                              <T v="mono" style={{ fontSize: 13, color: it.known ? colors.text : colors.text2 }}>
                                {rs(it.net)}
                              </T>
                            </View>
                          ))}
                      </View>
                    ))
                )}
              </Panel>
              {plan.cut.length || plan.none.length ? (
                <T v="caption" style={{ lineHeight: 18 }}>
                  {plan.cut.length ? `Left out because the dividend was cut: ${plan.cut.join(', ')}. ` : ''}
                  {plan.none.length ? `Paid no cash dividend in the last year: ${plan.none.join(', ')}.` : ''}
                </T>
              ) : null}
              <T v="caption" style={{ lineHeight: 18 }}>
                "Expected" repeats each dividend from the last 12 months a year later, at the same amount; companies change them with their
                results. Payment is about two weeks after book closure. Bonus shares and today's share counts only.
              </T>
            </Section>

            <Section title="To raise it">
              <Panel style={{ paddingVertical: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T v="body" style={{ flex: 1, color: colors.text2 }}>
                    If you put in
                  </T>
                  <TextInput value={amountText} onChangeText={setAmountText} keyboardType="numeric" style={styles.amount} accessibilityLabel="Amount to invest" />
                </View>
                {ideas.length ? (
                  ideas.map((s) => {
                    const rate = dividendTaxRate(tax, payerKind(s.sector));
                    const a = amount * ((s.divYield ?? 0) / 100) * (1 - rate);
                    return (
                      <Pressable key={s.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: s.symbol })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <T style={{ fontFamily: fonts.bold, fontSize: 14, width: 70 }}>{s.symbol}</T>
                        <T v="caption" style={{ flex: 1 }} numberOfLines={1}>
                          {s.divYield!.toFixed(1)}% yield · {s.sector}
                        </T>
                        <T v="mono" style={{ fontSize: 13.5, color: colors.up }}>
                          +{rs(a)}/yr
                        </T>
                      </Pressable>
                    );
                  })
                ) : (
                  <T v="caption">No index stock you don't own has a dividend yield between 5% and 18% right now.</T>
                )}
                <T v="caption" style={{ lineHeight: 18 }}>
                  {bench === 'KMI30' ? 'KMI-30 members' : 'KSE-100 and KMI-30 members'} you don't own, yield 5–18%, after tax. A very high yield
                  can mean a one-off payout or a falling price: open each and check its dividend history before buying. Information, not advice.
                </T>
              </Panel>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Key({ fill, border, text }: { fill: string; border?: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: fill, borderWidth: border ? 1 : 0, borderColor: colors.gold }} />
      <T v="caption">{text}</T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    amount: { width: 130, height: 42, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontSize: 15, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
  }),
);
