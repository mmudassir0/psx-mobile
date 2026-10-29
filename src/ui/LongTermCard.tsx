/** The long-term list, shown as the experiment it is: this month's stocks, how they've done, and the monthly record. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtDay, fmtPrice } from '../format';
import { isLtFeed, type LtFeed } from '../analysis/longterm';
import { useFeedFile } from '../picks/feed';
import { useMarket } from '../store/market';
import { Panel } from './bits';
import { T } from './kit';

const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

export function LongTermCard() {
  const nav = useNavigation();
  const { data: f } = useFeedFile<LtFeed>('longterm.json', isLtFeed);
  const { bySymbol } = useMarket();
  if (!f) return <T v="caption">Starts with the next daily update after the close.</T>;
  const still = new Set(f.today.list.map((r) => r.symbol));
  const rows = f.picks.map(([symbol, at]) => {
    const now = bySymbol.get(symbol)?.price ?? null;
    return { symbol, at, now, ret: now != null && at > 0 ? now / at - 1 : null, row: f.list.find((r) => r.symbol === symbol) };
  });
  const rets = rows.map((r) => r.ret).filter((v): v is number => v != null);
  const avg = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
  return (
    <View style={{ gap: 10 }}>
      <Panel style={{ paddingVertical: 12, gap: 6, backgroundColor: colors.goldSoft }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.gold }}>Experiment, not advice</T>
        <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
          Companies whose profit grew last year, cheaper than their sector on P/E, with the price above its 200-day average; the 10 cheapest, chosen once a month and meant to be held 6–12 months. In testing it beat the
          average stock in 16 of 17 monthly lists up to September 2025, then lost in all 6 since the market turned. It runs here so you can see whether it recovers before trusting it.
        </T>
      </Panel>
      <Panel style={{ paddingVertical: 4 }}>
        <T v="caption" style={{ paddingTop: 10 }}>
          {f.month} list, formed from the {fmtDay(dayT(f.formed))} close{avg != null ? ` · ${pc(avg)} on average since` : ''}
        </T>
        {rows.length === 0 ? (
          <T v="caption" style={{ paddingVertical: 10 }}>
            No company passed every rule when this month's list was formed.
          </T>
        ) : (
          rows.map((r, i) => (
            <Pressable key={r.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: r.symbol })} style={[styles.row, i < rows.length - 1 && styles.border]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T style={{ fontFamily: fonts.heavy, fontSize: 15 }}>{r.symbol}</T>
                <T v="caption" numberOfLines={1}>
                  {r.row ? `P/E ${r.row.pe.toFixed(1)} vs sector ${r.row.sectorPe.toFixed(1)} · profit ${pc(r.row.growth)} (FY${r.row.fy})` : `Formed at ${fmtPrice(r.at)}`}
                </T>
                <T v="caption" style={{ color: still.has(r.symbol) ? colors.up : colors.muted }}>
                  {still.has(r.symbol) ? 'Still passes every rule' : "Wouldn't pass today"}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T v="mono" style={{ fontSize: 14.5 }}>
                  {r.now != null ? fmtPrice(r.now) : fmtPrice(r.at)}
                </T>
                <T v="caption" style={{ color: r.ret == null ? colors.muted : r.ret >= 0 ? colors.up : colors.downText }}>
                  {r.ret == null ? '' : `${pc(r.ret)} since`}
                </T>
              </View>
            </Pressable>
          ))
        )}
      </Panel>
      <T v="caption" style={{ lineHeight: 18 }}>
        Today {f.today.list.length} of {f.today.valued} profitable, actively traded companies pass
        {f.today.belowTrend ? `; ${f.today.belowTrend} more pass everything except being above the 200-day average, held back by the falling market` : ''}.
      </T>
      {f.record.length ? (
        <Panel style={{ paddingVertical: 10, gap: 6 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Record: each list against the average stock</T>
          {f.record.map((m) => (
            <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                {m.month} ({m.n})
              </T>
              <T v="mono" style={{ width: 66, textAlign: 'right', fontSize: 13.5 }}>
                {pc(m.ret)}
              </T>
              <T v="mono" style={{ width: 66, textAlign: 'right', fontSize: 13.5, color: colors.muted }}>
                {pc(m.base)}
              </T>
              <T v="mono" style={{ width: 66, textAlign: 'right', fontSize: 13.5, color: m.ret >= m.base ? colors.up : colors.downText }}>
                {pc(m.ret - m.base)}
              </T>
            </View>
          ))}
          <T v="caption">List · average liquid stock · difference, from each list's start to the last close. Prices only, so dividends are left out of both.</T>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
