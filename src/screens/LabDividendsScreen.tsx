/** Who usually pays when, market-wide, from ten years of dividends. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { useLab } from '../lab/store';
import { divCalendar } from '../lab/divCalendar';
import { useHoldings } from '../portfolio/holdings';
import { useUser } from '../store/user';
import { Panel } from '../ui/bits';
import { Empty, IconButton, Loading, T } from '../ui/kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function LabDividendsScreen() {
  const nav = useNavigation();
  const { lab, busy } = useLab();
  const { holdings } = useHoldings();
  const { watchlist } = useUser();
  const mine = new Set([...holdings.map((h) => h.symbol), ...watchlist]);
  const next = (new Date(Date.now() + 5 * 3600_000).getUTCMonth() + 1) % 12;
  const [month, setMonth] = useState(next);
  const [shariah, setShariah] = useState(false);
  const cal = useMemo(() => (lab ? divCalendar(lab, 2017) : null), [lab]);
  const list = (cal?.[month] ?? []).filter((x) => !shariah || x.shariah);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Who pays when
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <T v="body" style={{ fontSize: 14, color: colors.text2, lineHeight: 20 }}>
          The stocks that usually go ex-dividend in each month, from ten years of PSX dividend notices. Buy before the ex-date to get the payment; the price usually drops by about the dividend that day.
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {MONTHS.map((m, k) => (
            <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: k === month }} onPress={() => setMonth(k)} style={[styles.chip, k === month && styles.chipOn]}>
              <T style={{ fontFamily: fonts.bold, fontSize: 13, color: k === month ? colors.onGold : colors.muted }}>{m}</T>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T v="body" style={{ flex: 1, fontSize: 14 }}>
            Shariah-compliant only
          </T>
          <Switch value={shariah} onValueChange={setShariah} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
        </View>
        {!lab ? (
          busy ? (
            <Loading />
          ) : (
            <Empty title="The lab's data isn't here yet" body="It downloads once from the Backtesting lab." />
          )
        ) : !list.length ? (
          <Empty title={`No regular payers in ${MONTHS[month]}`} />
        ) : (
          <Panel style={{ paddingVertical: 4 }}>
            {list.slice(0, 60).map((x, i) => (
              <Pressable key={x.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: x.symbol })} style={[styles.row, i < Math.min(60, list.length) - 1 && styles.border]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14, color: mine.has(x.symbol) ? colors.gold : colors.text }}>{x.symbol}</T>
                  <T v="caption" numberOfLines={1} style={{ textTransform: 'capitalize' }}>
                    {x.sector.toLowerCase()} · last {x.last}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T style={{ fontFamily: fonts.semibold, fontSize: 13 }}>
                    {x.years} of {x.of} years
                  </T>
                  <T v="caption">about {(x.payYield * 100).toFixed(1)}% a payment</T>
                </View>
              </Pressable>
            ))}
          </Panel>
        )}
        <T v="caption" style={{ lineHeight: 17 }}>
          Gold: your holdings and watchlist. Dates move a little from year to year, and a company can skip or cut a dividend: check its announcements. Some older dividends may be missing. Information, not advice.
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  }),
);
