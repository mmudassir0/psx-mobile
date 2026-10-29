/** A ring of how the portfolio is split, that sweeps round once when it appears. Up to six slices; the rest go in the last. */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, seriesColor } from '../theme';

const ACircle = Animated.createAnimatedComponent(Circle);

export interface Slice {
  label: string;
  value: number;
}

/** The slices to draw: the five biggest, then "Others". */
export function ringSlices(items: Slice[]): Slice[] {
  const sorted = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= 6) return sorted;
  const rest = sorted.slice(5).reduce((a, x) => a + x.value, 0);
  return [...sorted.slice(0, 5), { label: 'Others', value: rest }];
}

export function AllocationRing({ slices, size = 132, stroke = 14, children }: { slices: Slice[]; size?: number; stroke?: number; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const gap = slices.length > 1 ? 2 : 0;
  let at = 0;
  // a ground-coloured ring drawn over the slices pulls back to uncover them
  const cover = useSharedValue(reduce ? -C : 0);
  useEffect(() => {
    if (reduce) return;
    cover.value = 0;
    cover.value = withDelay(250, withTiming(-C, { duration: 1200, easing: Easing.bezier(0.5, 0, 0.2, 1) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [C, reduce, slices.length]);
  const coverProps = useAnimatedProps(() => ({ strokeDashoffset: cover.value }));
  const label = slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ');
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`Split of your portfolio: ${label}`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {slices.map((s, i) => {
          const len = Math.max(0, (s.value / total) * C - gap);
          const off = -at;
          at += (s.value / total) * C;
          return <Circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seriesColor(i)} strokeWidth={stroke} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} />;
        })}
        <ACircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.ground} strokeWidth={stroke + 2} strokeDasharray={`${C} ${C}`} animatedProps={coverProps} />
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}
