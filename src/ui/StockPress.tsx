/** A stock's News tab: recent press headlines naming the company, above its PSX announcements. */
import React from 'react';
import { useFlag } from '../flags';
import { View } from 'react-native';
import { fonts } from '../theme';
import { Panel } from './bits';
import { T } from './kit';
import { NewsRows, useNews } from './NewsList';

export function StockPress({ symbol }: { symbol: string }) {
  const enabled = useFlag('news');
  const { items } = useNews();
  const mine = items.filter((n) => n.symbols.includes(symbol));
  if (!mine.length || !enabled) return null;
  return (
    <View style={{ gap: 8, marginBottom: 18 }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 16 }}>In the press</T>
      <Panel style={{ paddingVertical: 2 }}>
        <NewsRows items={mine} max={6} />
      </Panel>
      <T v="caption">Matched by company name, so a headline may occasionally be about something else.</T>
    </View>
  );
}
