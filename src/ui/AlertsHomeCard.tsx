/** Home: your price alerts, how far each stock is from its line, and whether GitHub has the latest list. */
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space } from '../theme';
import { describeRule, rulesText } from '../analysis/watch';
import { watchCopiedPref, watchRulesPref } from '../portfolio/prefs';
import { useMarket } from '../store/market';
import { Panel } from './bits';
import { Section, T } from './kit';

export function AlertsHomeCard({ padded }: { padded?: boolean }) {
  const nav = useNavigation();
  const rules = watchRulesPref.use();
  const copied = watchCopiedPref.use();
  const { bySymbol } = useMarket();
  if (!rules.length) return null;
  const rows = rules
    .map((r) => {
      const now = bySymbol.get(r.symbol)?.price ?? null;
      const gap = now != null && r.level !== 'ma200' ? now / r.level - 1 : null;
      return { r, now, gap };
    })
    // closest to triggering first
    .sort((a, b) => Math.abs(a.gap ?? 9) - Math.abs(b.gap ?? 9))
    .slice(0, 4);
  return (
    <View style={padded ? { paddingHorizontal: space.gutter } : undefined}>
      <Section title="Price alerts" action="Edit" onAction={() => nav.navigate('Alerts')}>
        <Panel style={{ paddingVertical: 10, gap: 8 }}>
          {rows.map(({ r, gap }) => (
            <View key={`${r.symbol}${r.dir}${r.level}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T v="body" style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>
                {describeRule(r)}
              </T>
              <T v="caption" style={{ color: gap != null && Math.abs(gap) < 0.03 ? colors.gold : colors.muted, fontFamily: fonts.semibold }}>
                {gap == null ? '' : `${Math.abs(gap * 100).toFixed(1)}% away`}
              </T>
            </View>
          ))}
          {rulesText(rules) !== copied ? (
            <T v="caption" style={{ color: colors.gold, lineHeight: 18 }} onPress={() => nav.navigate('Alerts')}>
              Changed since you last copied them to GitHub: tap to copy, then update the WATCH_ALERTS secret.
            </T>
          ) : null}
        </Panel>
      </Section>
    </View>
  );
}
