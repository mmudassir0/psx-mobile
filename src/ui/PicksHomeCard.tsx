/** Home screen summary of the daily picks. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtDay, fmtPrice } from '../format';
import { usePicksFeed } from '../picks/feed';
import { Panel } from './bits';
import { StaleNote } from './StaleNote';
import { Section, T } from './kit';
import { useMarket } from '../store/market';
import { liveStatus } from './PickCard';

export function PicksHomeCard() {
  const nav = useNavigation();
  const { feed } = usePicksFeed();
  const { bySymbol } = useMarket();
  if (!feed) return null;
  const when = fmtDay(Date.parse(feed.day + 'T12:00:00Z'));
  const w = feed.weakStats;
  if (!feed.marketOk) {
    // In a weak market there are no trades to suggest: don't show buy levels at all.
    return (
      <Section title="Daily picks" action="See all" onAction={() => nav.navigate('Picks')}>
        <StaleNote feed={feed} />
        <Panel style={{ paddingVertical: 14, gap: 6 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.downText }}>No trades today: the market is falling</T>
          <T v="caption" style={{ lineHeight: 18 }}>
            {feed.breadth != null ? `Only ${Math.round(feed.breadth * 100)}% of liquid stocks are above their 200-day average (${when} close). ` : ''}
            Short-term setups mostly lose in markets like this
            {w.bought ? `: of the last ${w.bought} that reached their buy zone, ${w.won} made money (average ${w.avgRet != null ? `${(w.avgRet * 100).toFixed(1)}%` : '–'})` : ''}. Sahm
            will show picks again when at least half of stocks are back above their 200-day average.
          </T>
        </Panel>
      </Section>
    );
  }
  const list = feed.picks.slice(0, 3);
  return (
    <Section title="Daily picks" action="See all" onAction={() => nav.navigate('Picks')}>
      <StaleNote feed={feed} />
      <Panel style={{ paddingVertical: 10 }}>
        <T v="caption" style={{ color: colors.up, paddingVertical: 4 }}>
          Market strong · from the {when} close
        </T>
        {list.length === 0 ? (
          <T v="caption" style={{ paddingVertical: 8 }}>
            No setups at the last close.
          </T>
        ) : (
          list.map((p, i) => {
            const st = liveStatus(p, bySymbol.get(p.symbol)?.price ?? null, false);
            return (
              <Pressable key={p.symbol} accessibilityRole="button" onPress={() => nav.navigate('Picks')} style={[styles.row, i < list.length - 1 && styles.border, st.dead && { opacity: 0.55 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{p.symbol}</T>
                  <T v="caption">
                    Buy {fmtPrice(p.levels.entryLow)}–{fmtPrice(p.levels.entryHigh)}
                  </T>
                  {st.text ? (
                    <T v="caption" style={{ color: st.tone }} numberOfLines={2}>
                      {st.text}
                    </T>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="mono" style={{ fontSize: 13.5, color: colors.up }}>
                    TP1 {fmtPrice(p.levels.tp1)}
                  </T>
                  <T v="mono" style={{ fontSize: 13.5, color: colors.downText }}>
                    SL {fmtPrice(p.levels.stop)}
                  </T>
                </View>
              </Pressable>
            );
          })
        )}
      </Panel>
    </Section>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
