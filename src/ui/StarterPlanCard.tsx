/**
 * Starting out: type the cash at your broker, and Sahm suggests a first spread of big, profitable
 * dividend payers (or one index fund for small amounts): which, how many shares, how much each,
 * the fees, and what stays as cash. Once bought, one tap adds them as holdings.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtNum, fmtPrice } from '../format';
import { useMarket } from '../store/market';
import { cashPref } from '../portfolio/prefs';
import { costsPref } from '../portfolio/costs';
import { setHoldings, useHoldings } from '../portfolio/holdings';
import { starterPlan } from '../portfolio/starter';
import { shortSector } from '../sectors';
import { makePref } from '../prefs';
import { Panel } from './bits';
import { Button, Segmented, T } from './kit';
import { Press, Rise } from './motion';

const shariahOnlyPref = makePref<boolean>('user.starterShariah', true);

export function StarterPlanCard({ title = 'Start investing' }: { title?: string }) {
  const nav = useNavigation();
  const { stocks, ready } = useMarket();
  const cash = cashPref.use();
  const costs = costsPref.use();
  const shariah = shariahOnlyPref.use();
  const { holdings } = useHoldings();
  const [text, setText] = useState(cash.amount > 0 ? String(Math.round(cash.amount)) : '');
  const [added, setAdded] = useState(false);
  const amount = Number(text.replace(/[^\d.]/g, '')) || 0;
  const plan = useMemo(() => (ready && amount > 0 ? starterPlan(stocks, amount, { shariah, costs }) : null), [stocks, ready, amount, shariah, costs]);

  const addAsHoldings = async () => {
    if (!plan) return;
    // what you paid per share includes the buy's charges, as a broker statement shows it
    const bought = plan.lines.map((l) => ({ symbol: l.symbol, shares: l.shares, avgCost: Math.round(((l.amount + l.cost) / l.shares) * 100) / 100 }));
    const others = holdings.filter((h) => !bought.some((b) => b.symbol === h.symbol));
    await setHoldings([...others, ...bought]);
    await cashPref.set({ amount: Math.round(plan.left), at: Date.now() });
    setAdded(true);
  };

  return (
    <Panel style={{ paddingVertical: 16, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <T style={{ fontFamily: fonts.heavy, fontSize: 17 }}>{title}</T>
        <T v="caption" style={{ lineHeight: 18 }}>
          Type the cash in your broker account. Sahm spreads it over big, profitable companies that pay dividends, one per sector, in whole shares with the fees counted.
        </T>
      </View>

      <View style={{ gap: 6 }}>
        <T v="label">Cash at your broker</T>
        <View style={styles.inputRow}>
          <T style={{ fontFamily: fonts.monoMedium, fontSize: 16, color: colors.muted }}>Rs</T>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setAdded(false);
              const v = Number(t.replace(/[^\d.]/g, '')) || 0;
              cashPref.set({ amount: v, at: Date.now() }).catch(() => {});
            }}
            placeholder="100,000"
            keyboardType="numeric"
            placeholderTextColor={colors.faint}
            style={styles.input}
            accessibilityLabel="Cash at your broker, in rupees"
          />
        </View>
      </View>

      <Segmented
        options={[
          { key: 'yes', label: 'Shariah only' },
          { key: 'no', label: 'Any company' },
        ]}
        value={shariah ? 'yes' : 'no'}
        onChange={(k) => shariahOnlyPref.set(k === 'yes')}
      />

      {!ready ? (
        <T v="caption">Waiting for today's prices…</T>
      ) : !amount ? null : !plan || !plan.lines.length ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          {plan?.note ?? 'Nothing fits this amount yet.'}
        </T>
      ) : (
        <Rise key={`${amount}-${shariah}`} style={{ gap: 12 }}>
          <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
            {plan.note}
          </T>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
            {plan.lines.map((l) => (
              <Press key={l.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: l.symbol })} scaleTo={0.985} style={styles.row}>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <T style={{ fontFamily: fonts.heavy, fontSize: 15 }}>{l.symbol}</T>
                  <T v="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
                    {shortSector(l.sector)}
                  </T>
                  <T v="caption" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 15 }}>
                    {l.why}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T v="mono" style={{ fontSize: 15 }}>
                    Rs {fmtNum(l.amount, 0)}
                  </T>
                  <T v="caption" style={{ fontFamily: fonts.mono, fontSize: 11.5 }}>
                    {fmtNum(l.shares, 0)} × {fmtPrice(l.price)}
                  </T>
                </View>
              </Press>
            ))}
          </View>
          <View style={styles.totals}>
            <Total label="Shares" value={plan.spent - plan.fees} />
            <Total label="Fees" value={plan.fees} />
            <Total label="Left as cash" value={plan.left} strong />
          </View>
          {added ? (
            <T v="caption" style={{ color: colors.up, fontFamily: fonts.semibold }}>
              Added to your holdings, with Rs {fmtNum(plan.left, 0)} kept as cash at your broker.
            </T>
          ) : (
            <Button small tone="ghost" label="Bought them? Add to my holdings" onPress={addAsHoldings} />
          )}
          <T v="caption" style={{ lineHeight: 17 }}>
            Prices move, so your broker may fill a few shares more or fewer. A rule-based starting point using today's figures, not advice: read each company's page before buying, and only invest money you won't need for
            a few years.
          </T>
        </Rise>
      )}
    </Panel>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption" style={{ fontSize: 11.5 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 14, color: strong ? colors.text : colors.text2 }}>
        Rs {fmtNum(value, 0)}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingHorizontal: 14 },
    input: { flex: 1, fontFamily: fonts.monoMedium, fontSize: 20, color: colors.text, paddingVertical: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    totals: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface2, borderRadius: 14, padding: 12 },
  }),
);
