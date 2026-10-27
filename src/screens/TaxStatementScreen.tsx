/** A tax-year statement: shares sold with gains and capital gains tax, cash dividends with tax withheld; shared as a PDF. */
import React, { useEffect, useMemo, useState } from 'react';
import { Explain } from '../ui/Explain';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay, fmtNum } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { useReviews } from '../portfolio/useReviews';
import { taxYearOf, tradesPref } from '../portfolio/trades';
import { boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023 } from '../portfolio/tax';
import { snapshots, type Snap } from '../portfolio/track';
import { pkToday } from '../journal/store';
import { snapshotLookup, statementHtml, taxStatement } from '../portfolio/taxStatement';
import { logProblem } from '../log';
import { Panel } from '../ui/bits';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

const rs = (v: number) => `Rs ${fmtNum(v, 0)}`;
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

export default function TaxStatementScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const { name } = useUser();
  const trades = tradesPref.use();
  const status = taxStatusPref.use();
  const bought = boughtPref.use();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);
  const current = taxYearOf(pkToday());
  const [year, setYear] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const st = useMemo(
    () =>
      taxStatement({
        year: Number(year),
        trades,
        status,
        bought,
        heldYears: heldSince2023(),
        holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, sector: r.stock?.sector ?? null, dividends: r.dividends })),
        snapshotShares: snapshotLookup(snaps),
      }),
    [year, trades, status, bought, rows, snaps],
  );

  const share = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const html = statementHtml(st, { name, status, made: fmtDay(Date.now()) });
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Sahm tax year ${st.year}`, UTI: 'com.adobe.pdf' });
      }
    } catch (e) {
      logProblem('tax statement PDF', e);
      setMsg((e as Error).message || "Couldn't make the PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Tax statement
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          options={[
            { key: String(current), label: `This year (TY${current})` },
            { key: String(current - 1), label: `Last year (TY${current - 1})` },
          ]}
          value={year}
          onChange={setYear}
        />
        <T v="caption">
          {fmtDay(dayT(st.from))} to {fmtDay(dayT(st.to))} · {status === 'filer' ? 'filer rates' : 'non-filer rates'}
        </T>
        <Panel style={{ paddingVertical: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Figure label="Net capital gain" value={rs(st.net)} tone={st.net < 0 ? 'down' : undefined} />
            <Figure label="Capital gains tax (est.)" value={rs(st.cgt)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Figure label="Cash dividends" value={rs(st.divGross)} />
            <Figure label="Tax withheld on them" value={rs(st.divWithheld)} />
          </View>
        </Panel>
        <Button label={busy ? 'Making the PDF…' : 'Share as PDF'} disabled={busy || loading} onPress={share} />
        {msg ? (
          <T v="caption" style={{ color: colors.downText }}>
            {msg}
          </T>
        ) : null}

        <Section title={`Shares sold (${st.sales.length})`} extra={<Explain id="cgt" />}>
          <Panel style={{ paddingVertical: 4 }}>
            {st.sales.length ? (
              st.sales.map((x, i) => (
                <View key={i} style={[styles.row, i < st.sales.length - 1 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>
                      {x.symbol} <T v="caption">{fmtDay(dayT(x.day))}</T>
                    </T>
                    <T v="caption">
                      {fmtNum(x.shares, 0)} at Rs {x.price.toFixed(2)} (cost Rs {x.avgCost.toFixed(2)}) · tax {rs(x.tax)}
                    </T>
                  </View>
                  <T v="mono" style={{ fontSize: 14, color: x.gain < 0 ? colors.downText : colors.up }}>
                    {x.gain < 0 ? '−' : '+'}
                    {rs(Math.abs(x.gain))}
                  </T>
                </View>
              ))
            ) : (
              <T v="caption" style={{ paddingVertical: 10 }}>
                No sales recorded in this tax year. Record sales with "Bought or sold" on a holding.
              </T>
            )}
          </Panel>
          {st.sales.length ? <T v="caption">Gains {rs(st.gains)} · losses {rs(st.losses)}, set off against the gains before tax.</T> : null}
        </Section>

        <Section title={`Cash dividends (${st.dividends.length})`}>
          <Panel style={{ paddingVertical: 4 }}>
            {loading ? (
              <T v="caption" style={{ paddingVertical: 10 }}>
                Reading each company's dividends…
              </T>
            ) : st.dividends.length ? (
              st.dividends.map((d, i) => (
                <View key={i} style={[styles.row, i < st.dividends.length - 1 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>
                      {d.symbol}
                      {d.assumed ? ' *' : ''} <T v="caption">{fmtDay(dayT(d.day))}</T>
                    </T>
                    <T v="caption">
                      {fmtNum(d.shares, 0)} × Rs {d.dps.toFixed(2)} · withheld {rs(d.withheld)}
                    </T>
                  </View>
                  <T v="mono" style={{ fontSize: 14 }}>
                    {rs(d.net)}
                  </T>
                </View>
              ))
            ) : (
              <T v="caption" style={{ paddingVertical: 10 }}>
                No cash dividends found for your holdings in this tax year.
              </T>
            )}
          </Panel>
        </Section>
        <T v="caption" style={{ lineHeight: 18 }}>
          {st.assumed.length ? `* Shares at book closure aren't known for ${st.assumed.join(', ')} (no trades or daily snapshot from then), so today's holding is used. ` : ''}
          Sales are the ones recorded in Sahm; dividends cover the stocks you hold now. Capital gains tax is an estimate: NCCPL works out and
          collects the real figure, and your broker's and NCCPL's annual statements are the official record for your return.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'down' }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 16, color: tone === 'down' ? colors.downText : colors.text }}>
        {value}
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
