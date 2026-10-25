/** Home: headlines about your holdings first, then the market's. */
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { space } from '../theme';
import { useHoldings } from '../portfolio/holdings';
import { Panel } from './bits';
import { Section, T } from './kit';
import { NewsRows, useNews } from './NewsList';

export function NewsHomeCard() {
  const nav = useNavigation();
  const { items } = useNews();
  const { holdings } = useHoldings();
  if (!items.length) return null;
  const held = new Set(holdings.map((h) => h.symbol));
  const mine = items.filter((n) => n.symbols.some((s) => held.has(s)) && Date.now() - n.t < 3 * 864e5);
  const shown = mine.length ? [...mine.slice(0, 3), ...items.filter((n) => n.market && !mine.includes(n)).slice(0, 2)] : items.filter((n) => n.market).slice(0, 4);
  return (
    <View style={{ paddingHorizontal: space.gutter }}>
      <Section title="News" action="More" onAction={() => nav.navigate('News')}>
        <Panel style={{ paddingVertical: 2 }}>
          <NewsRows items={shown} held={held} />
        </Panel>
        {held.size && !mine.length ? <T v="caption">Nothing naming your holdings in the last three days; these are the market's headlines.</T> : null}
      </Section>
    </View>
  );
}
