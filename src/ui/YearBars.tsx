/** Year by year: a strategy's return (dark) beside the index's (light), rising or falling from a middle line. Bars grow in. */
import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { GrowBar } from './motion';
import { T } from './kit';

export function YearBars({ years, height = 92 }: { years: { year: number; ret: number; bench: number }[]; height?: number }) {
  if (!years.length) return null;
  const half = height / 2;
  const max = Math.max(0.3, ...years.flatMap((y) => [Math.abs(y.ret), Math.abs(y.bench)]));
  const px = (v: number) => Math.max(1, Math.round((Math.abs(v) / max) * (half - 2)));
  const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`;
  const bar = (v: number, strong: boolean, delay: number) => {
    const up = v >= 0;
    const color = up ? colors.text : colors.down;
    const opacity = strong ? 1 : 0.3;
    return (
      <View style={{ width: 9, height }}>
        <View style={{ height: half, justifyContent: 'flex-end' }}>
          {up ? <GrowBar vertical delay={delay} style={{ height: px(v), backgroundColor: color, opacity, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} /> : null}
        </View>
        <View style={{ height: half }}>{!up ? <GrowBar vertical fromTop delay={delay} style={{ height: px(v), backgroundColor: color, opacity, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} /> : null}</View>
      </View>
    );
  };
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Year by year, strategy then index: ${years.map((y) => `${y.year} ${pc(y.ret)} and ${pc(y.bench)}`).join('; ')}`}>
      <View style={{ height, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: half, height: 1, backgroundColor: colors.line }} />
        {years.map((y, i) => (
          <View key={y.year} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
            {bar(y.ret, true, 250 + i * 60)}
            {bar(y.bench, false, 250 + i * 60)}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {years.map((y) => (
          <T key={y.year} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 10, color: colors.faint }}>
            '{String(y.year).slice(2)}
          </T>
        ))}
      </View>
    </View>
  );
}
