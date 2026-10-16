/** One line on Home: KSE-100's trend and how many stocks are in uptrends. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { usePicksFeed } from '../picks/feed';
import { freshness } from '../picks/build';
import { T } from './kit';

export function MarketLine() {
  const nav = useNavigation();
  const { market } = usePicksFeed();
  const k = market?.indices.KSE100;
  if (!market || !k) return null;
  const color = k.regime === 'Uptrend' ? colors.up : k.regime === 'Downtrend' ? colors.downText : colors.text;
  return (
    <Pressable accessibilityRole="button" onPress={() => nav.navigate('Index', { code: 'KSE100' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontSize: 14 }}>
          KSE-100 <T style={{ fontFamily: fonts.bold, fontSize: 14, color }}>{k.regime.toLowerCase()}</T> for {k.days} trading days
          {market.breadth != null ? ` · ${Math.round(market.breadth * 100)}% of stocks in uptrends` : ''}
          {freshness(market) ? <T v="caption"> · as of {market.day}</T> : null}
        </T>
      </View>
      <T style={{ color: colors.gold, fontFamily: fonts.semibold }}>›</T>
    </Pressable>
  );
}
