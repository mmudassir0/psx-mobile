/** Your holdings, trades, dividends, tax year and daily values as an Excel file, to keep or share. */
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { taxYearOf, tradesPref } from '../portfolio/trades';
import { boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023 } from '../portfolio/tax';
import { snapshots, type Snap } from '../portfolio/track';
import { pkToday } from '../journal/store';
import { snapshotLookup, taxStatement } from '../portfolio/taxStatement';
import { workbook } from '../portfolio/exportData';
import { toBase64, xlsx } from '../xlsx';
import { logProblem } from '../log';
import { Panel } from '../ui/bits';
import { Button, IconButton, T } from '../ui/kit';

const SHEETS = ['Holdings: shares, cost, price, value, gain, weight', 'Trades: every buy and sale you recorded', "Dividends: each holding's payouts from PSX", 'Tax year: sales, gains, dividends and tax', 'Daily value: the snapshot Sahm saves each day'];

export default function ExportScreen() {
  const nav = useNavigation();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows, loading } = useReviews(holdings, stocks, bySymbol, null);
  const trades = tradesPref.use();
  const status = taxStatusPref.use();
  const bought = boughtPref.use();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);

  const make = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const tax = taxStatement({
        year: taxYearOf(pkToday()),
        trades,
        status,
        bought,
        heldYears: heldSince2023(),
        holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares, sector: r.stock?.sector ?? null, dividends: r.dividends })),
        snapshotShares: snapshotLookup(snaps),
      });
      const bytes = xlsx(workbook({ rows, trades, snaps, tax, made: fmtDay(Date.now()) }));
      const name = `Sahm ${pkToday()}.xlsx`;
      if (Platform.OS === 'web') {
        const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      } else {
        const uri = `${FileSystem.cacheDirectory}${name.replace(/ /g, '_')}`;
        await FileSystem.writeAsStringAsync(uri, toBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Sahm data', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
      }
      setMsg('Done.');
    } catch (e) {
      logProblem('Excel export', e);
      setMsg((e as Error).message || "Couldn't make the file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Export to Excel
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={{ paddingVertical: 14, gap: 8 }}>
          <T v="body" style={{ fontSize: 14, color: colors.text2 }}>
            One Excel file with a sheet for each:
          </T>
          {SHEETS.map((s) => (
            <T key={s} v="caption" style={{ lineHeight: 18 }}>
              • {s}
            </T>
          ))}
        </Panel>
        <Button label={busy ? 'Making the file…' : loading ? 'Reading your holdings…' : 'Make the Excel file'} disabled={busy || loading} onPress={make} />
        {msg ? (
          <T v="caption" style={{ color: msg === 'Done.' ? colors.up : colors.downText }}>
            {msg}
          </T>
        ) : null}
        <T v="caption" style={{ lineHeight: 18 }}>
          Opens in Excel, Google Sheets or WPS. Share it to Drive or email to keep a copy. It holds your holdings and amounts, so share it only
          with people you trust. For restoring Sahm, use the backup in Settings instead.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
  }),
);
