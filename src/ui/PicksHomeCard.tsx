/** Home screen summary of the daily picks. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, themed } from '../theme';
import { fmtDay, fmtPrice } from '../format';
import { usePicksFeed } from '../picks/feed';
import { Panel } from './bits';
import { Section, T } from './kit';

export function PicksHomeCard() {
  const nav = useNavigation();
  const { feed } = usePicksFeed();
  if (!feed) return null;
  const list = feed.picks.slice(0, 3);
  return (
    <Section title={feed.marketOk ? 'Daily picks' : 'Setups to watch'} action="See all" onAction={() => nav.navigate('Picks')}>
      <Panel style={{ paddingVertical: 10 }}>
        <T v="caption" style={{ color: feed.marketOk ? colors.up : colors.downText, paddingVertical: 4 }}>
          {feed.marketOk ? 'Market strong' : 'Market weak: watch only'} · from the {fmtDay(Date.parse(feed.day + 'T12:00:00Z'))} close
        </T>
        {list.length === 0 ? (
          <T v="caption" style={{ paddingVertical: 8 }}>
            No setups at the last close.
          </T>
        ) : (
          list.map((p, i) => (
            <Pressable key={p.symbol} accessibilityRole="button" onPress={() => nav.navigate('Picks')} style={[styles.row, i < list.length - 1 && styles.border]}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{p.symbol}</T>
                <T v="caption">
                  Buy {fmtPrice(p.levels.entryLow)}–{fmtPrice(p.levels.entryHigh)}
                </T>
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
          ))
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
