/** Shariah corner: compliance of each holding, the share of money that's compliant, dividend purification and zakat in one place. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { tradesPref } from '../portfolio/trades';
import { snapshots, type Snap } from '../portfolio/track';
import { sharesFromTrades, snapshotLookup } from '../portfolio/taxStatement';
import { dividendsReceived, purificationPref, setRate, shariahSummary, type Status } from '../portfolio/shariah';
import { ZakatCard } from '../ui/ZakatCard';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, Segmented, T } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(Math.round(v), 0)}`;
const pkToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const LABEL: Record<Status, string> = { kmi30: 'KMI-30', compliant: 'Compliant', not: 'Not compliant' };

type Period = '12m' | 'year';

function RateInput({ value, placeholder, onDone }: { value: number | null; placeholder: string; onDone: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={() => {
        const t = text.trim().replace(',', '.');
        onDone(t === '' ? null : Number(t));
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType="decimal-pad"
      accessibilityLabel="Purification percentage"
      style={styles.rate}
    />
  );
}

export default function ShariahScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const p = purificationPref.use();
  const [period, setPeriod] = useState<Period>('12m');
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const today = pkToday();
  const from = useMemo(() => {
    if (period === '12m') return new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10);
    // Pakistan's tax year: 1 July to 30 June
    const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
    return `${y}-07-01`;
  }, [period, today]);

  const sum = useMemo(() => {
    const fromSnaps = snaps ? snapshotLookup(snaps) : () => null;
    return shariahSummary(
      rows.map((r) => {
        const sym = r.holding.symbol;
        const st = r.stock ?? bySymbol.get(sym);
        const got = dividendsReceived(r.dividends?.list ?? [], (day) => sharesFromTrades(trades, sym, day, r.holding.shares) ?? fromSnaps(sym, day) ?? r.holding.shares, from, today);
        return { symbol: sym, value: r.value, shariah: !!st?.shariah, kmi30: !!st?.indexes.includes('KMI30'), received: got.total };
      }),
      p,
    );
  }, [rows, bySymbol, trades, snaps, p, from, today]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Shariah corner
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to see how much of your money is Shariah-compliant and what purification is due." />
        ) : loading && !rows.length ? (
          <Skeleton kind="cards" n={3} />
        ) : (
          <>
            <Panel style={{ paddingVertical: 14, gap: 8 }}>
              <T v="caption">Shariah-compliant</T>
              <T v="mono" style={{ fontSize: 28, color: sum.compliantShare >= 0.999 ? colors.shariah : colors.text }}>
                {(sum.compliantShare * 100).toFixed(sum.compliantShare > 0.995 && sum.compliantShare < 1 ? 1 : 0)}%
              </T>
              <View style={styles.bar}>
                <View style={{ flex: Math.max(sum.compliantShare, 0.0001), backgroundColor: colors.shariah }} />
                <View style={{ flex: Math.max(1 - sum.compliantShare, 0.0001), backgroundColor: colors.down }} />
              </View>
              <T v="caption" style={{ lineHeight: 18 }}>
                {rs(sum.compliantValue)} of {rs(sum.total)} is in KMI All Share companies.
                {sum.notCount ? ` ${sum.notCount} holding${sum.notCount === 1 ? ' is' : 's are'} not on the list.` : ' Every holding is on the list.'}
              </T>
            </Panel>

            <Section title="Your holdings">
              <Panel style={{ paddingVertical: 4 }}>
                {sum.lines.map((l, i) => (
                  <Pressable key={l.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: l.symbol })} style={[styles.row, i < sum.lines.length - 1 && styles.border]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{l.symbol}</T>
                      <T v="caption">
                        {rs(l.value)} · {sum.total ? ((l.value / sum.total) * 100).toFixed(0) : 0}%
                      </T>
                    </View>
                    <View style={[styles.pill, { backgroundColor: l.status === 'not' ? colors.downSoft : colors.shariahSoft }]}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 11.5, color: l.status === 'not' ? colors.downText : colors.shariah }}>{LABEL[l.status]}</T>
                    </View>
                  </Pressable>
                ))}
              </Panel>
              <T v="caption" style={{ lineHeight: 17 }}>
                KMI All Share lists the companies that pass the Shariah screening (KMI-30 are the 30 biggest of them). The list is reviewed twice a year, so a company can join or leave it.
              </T>
            </Section>

            <Section title="Dividend purification">
              <Segmented
                options={[
                  { key: '12m', label: 'Last 12 months' },
                  { key: 'year', label: 'This tax year' },
                ]}
                value={period}
                onChange={setPeriod}
              />
              <Panel style={{ paddingVertical: 12, gap: 6 }}>
                <T v="caption">To give away (estimate)</T>
                <T v="mono" style={{ fontSize: 24, color: colors.gold }}>
                  {rs(sum.purify)}
                </T>
                <T v="caption" style={{ lineHeight: 18 }}>
                  From {rs(sum.received)} of cash dividends received (before tax) since {from}.
                </T>
              </Panel>
              <Panel style={{ paddingVertical: 4 }}>
                {sum.lines.filter((l) => l.received > 0).length === 0 ? (
                  <T v="caption" style={{ paddingVertical: 12 }}>
                    No dividends received in this period.
                  </T>
                ) : (
                  sum.lines
                    .filter((l) => l.received > 0)
                    .map((l, i, all) => (
                      <View key={l.symbol} style={[styles.row, i < all.length - 1 && styles.border]}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{l.symbol}</T>
                          <T v="caption">
                            {rs(l.received)} received · {rs(l.purify)} to give
                          </T>
                        </View>
                        {l.status === 'not' && p.nonCompliantFull ? (
                          <T v="caption">all of it</T>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <RateInput value={l.own ? p.perStock[l.symbol] : null} placeholder={String(p.defaultPct)} onDone={(v) => purificationPref.set(setRate(p, l.symbol, v))} />
                            <T v="caption">%</T>
                          </View>
                        )}
                      </View>
                    ))
                )}
              </Panel>
              <Panel style={{ paddingVertical: 10, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T style={{ flex: 1, fontSize: 14 }}>Usual rate for every company</T>
                  <RateInput value={p.defaultPct} placeholder="2" onDone={(v) => purificationPref.set({ ...p, defaultPct: v == null || !Number.isFinite(v) ? 0 : Math.max(0, Math.min(100, v)) })} />
                  <T v="caption">%</T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T style={{ flex: 1, fontSize: 14 }}>Give away all dividends from non-compliant shares</T>
                  <Switch value={p.nonCompliantFull} onValueChange={(v) => purificationPref.set({ ...p, nonCompliantFull: v })} trackColor={{ true: colors.gold }} />
                </View>
              </Panel>
              <T v="caption" style={{ lineHeight: 17 }}>
                Even compliant companies earn a little from interest (the screening allows up to 5% of revenue), so part of each dividend is given to charity. Sahm doesn't know each company's figure: type the percentage
                your scholar or Shariah fund publishes for a stock, or use one rate for all. This is an estimate to plan with, not a fatwa.
              </T>
            </Section>

            <Section title="Zakat">
              <ZakatCard rows={rows} />
            </Section>

            <Section title="What the screening checks">
              <Panel style={{ paddingVertical: 12, gap: 6 }}>
                {[
                  ['Business', 'The main business is permissible (no conventional banking, insurance, alcohol, gambling and the like).'],
                  ['Debt', 'Interest-bearing loans are under 37% of total assets.'],
                  ['Investments', 'Money in non-compliant investments is under 33% of total assets.'],
                  ['Income', 'Income from non-compliant sources (mostly interest) is under 5% of revenue.'],
                  ['Real assets', 'At least 25% of assets are things like plant, stock and property, not just cash and receivables.'],
                  ['Price', 'The share price is at least the company’s net liquid assets per share.'],
                ].map(([k, v]) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 13, width: 84 }}>{k}</T>
                    <T v="caption" style={{ flex: 1, lineHeight: 17 }}>
                      {v}
                    </T>
                  </View>
                ))}
              </Panel>
              <T v="caption" style={{ lineHeight: 17 }}>
                In short, as the KMI index rules describe them. The screening is done by the index's Shariah board; Sahm only reads the list.
              </T>
            </Section>
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
    pill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
    rate: {
      width: 56,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      color: colors.text,
      fontFamily: fonts.medium,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 0,
    },
  }),
);
