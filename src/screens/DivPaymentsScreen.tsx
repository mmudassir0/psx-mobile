/** Dividends owed to you from past book closures: tick them off as they reach your bank, and see which are late. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
import { dividendTaxRate, payerKind } from '../analysis/dividends';
import { LATE_DAYS, owedPayments, owedSummary, receivedPref, tick, untick, type Owed } from '../portfolio/divPayments';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, T, ScreenHeader } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(Math.round(v), 0)}`;
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

function OwedRow({ o, last }: { o: Owed; last: boolean }) {
  const all = receivedPref.use();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const on = o.status === 'received';
  return (
    <View style={[styles.row, !last && styles.border]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${o.symbol} dividend received`}
        hitSlop={8}
        onPress={() => receivedPref.set(on ? untick(all, o.key) : tick(all, o.key))}
        style={[styles.box, on && { backgroundColor: colors.up, borderColor: colors.up }]}
      >
        {on ? <T style={{ color: colors.onGold, fontFamily: fonts.bold, fontSize: 13 }}>✓</T> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>{o.symbol}</T>
          <T v="mono" style={{ fontSize: 14, color: on ? colors.up : o.status === 'late' ? colors.downText : colors.text }}>
            {rs(o.received?.amount ?? o.net)}
          </T>
        </View>
        <T v="caption" style={{ fontSize: 11.5 }}>
          Book closure {fmtDay(dayT(o.day))} · {fmtNum(o.shares, 0)}
          {o.assumed ? '*' : ''} × Rs {o.dps.toFixed(2)} · {rs(o.gross)} before tax
        </T>
        {on ? (
          editing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={String(Math.round(o.net))}
                placeholderTextColor={colors.faint}
                style={styles.input}
                accessibilityLabel="Amount received"
                autoFocus
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const v = Number(amount.replace(/,/g, ''));
                  receivedPref.set(tick(all, o.key, v > 0 ? v : null, o.received?.at));
                  setEditing(false);
                }}
              >
                <T style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.gold }}>Save</T>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={4}>
              <T v="caption" style={{ color: colors.gold, fontSize: 11.5 }}>
                Received {fmtDay(o.received!.at)}
                {o.received?.amount ? `: ${rs(o.received.amount)}` : ''} · change amount
              </T>
            </Pressable>
          )
        ) : o.status === 'late' ? (
          <T v="caption" style={{ color: colors.downText, fontSize: 11.5 }}>
            {o.age} days since book closure: not received yet?
          </T>
        ) : (
          <T v="caption" style={{ fontSize: 11.5 }}>
            Usually arrives within a few weeks.
          </T>
        )}
      </View>
    </View>
  );
}

export default function DivPaymentsScreen() {
  const nav = useNavigation();
  const { holdings, loaded } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const status = taxStatusPref.use();
  const received = receivedPref.use();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const list = useMemo(() => {
    if (!snaps) return null;
    const fromSnaps = snapshotLookup(snaps);
    return owedPayments({
      holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, taxRate: dividendTaxRate(status, payerKind(r.stock?.sector)), list: r.dividends?.list ?? [] })),
      sharesOn: (s, d) => sharesFromTrades(trades, s, d, holdings.find((h) => h.symbol === s)?.shares ?? 0) ?? fromSnaps(s, d),
      received,
      now: Date.now(),
    });
  }, [snaps, rows, trades, status, received, holdings]);
  const sum = list ? owedSummary(list) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Dividend payments" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loaded && !holdings.length ? (
          <Empty title="No holdings yet" body="Add your holdings to track the dividends paid to you." />
        ) : !list || (loading && !rows.length) ? (
          <Skeleton kind="rows" n={5} />
        ) : !list.length ? (
          <Empty title="No dividends due" body="No book closures for your holdings in the last year." />
        ) : (
          <>
            <Panel style={{ paddingVertical: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <T v="caption">Received</T>
                  <T v="mono" style={{ fontSize: 18, color: colors.up }}>
                    {rs(sum!.received)}
                  </T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="caption">On the way</T>
                  <T v="mono" style={{ fontSize: 18 }}>
                    {rs(sum!.waiting)}
                  </T>
                </View>
              </View>
              {sum!.late.length ? (
                <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.downText }}>
                  {sum!.late.length} payment{sum!.late.length === 1 ? '' : 's'} not ticked {LATE_DAYS}+ days after book closure ({sum!.late.map((o) => o.symbol).join(', ')}).
                </T>
              ) : null}
            </Panel>
            {list.filter((o) => o.status !== 'received').length >= 2 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => receivedPref.set(list.filter((o) => o.status !== 'received').reduce((a, o) => tick(a, o.key), received))}
                style={{ alignSelf: 'flex-start' }}
              >
                <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>✓ Mark all as received (if they all came)</T>
              </Pressable>
            ) : null}
            <Section title="Last 12 months">
              <Panel style={{ paddingVertical: 4 }}>
                {list.map((o, i) => (
                  <OwedRow key={o.key} o={o} last={i === list.length - 1} />
                ))}
              </Panel>
            </Section>
            <T v="caption" style={{ lineHeight: 18 }}>
              Amounts are after the tax withheld at your status. Tick each one when it reaches your bank; type the amount if it differs. If one never comes, check your bank details (IBAN) with your broker and the
              company's share registrar: dividends can only be paid into the account on record. * shares assumed from today's holding.
            </T>
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
    row: { flexDirection: 'row', gap: 12, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    input: {
      width: 110,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      color: colors.text,
      fontFamily: fonts.medium,
      fontSize: 14,
      paddingHorizontal: 10,
      paddingVertical: 0,
    },
  }),
);
