/** Grey placeholder shapes that gently pulse while data loads, in the layout of what's coming. */
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { colors, themed } from '../theme';

function usePulse() {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(v, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' })]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function Bar({ w, h = 12, r = 6, style }: { w: DimensionValue; h?: number; r?: number; style?: object }) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.surface2 }, style]} />;
}

/**
 * kind: rows = a stock list; cards = stacked cards; chart = a price chart; text = a few lines;
 * chips = small cards side by side (index cards on Home).
 */
export function Skeleton({ kind = 'text', n = 5, height = 300, label }: { kind?: 'rows' | 'cards' | 'chart' | 'text' | 'chips'; n?: number; height?: number; label?: string }) {
  const opacity = usePulse();
  let body: React.ReactNode;
  if (kind === 'rows')
    body = Array.from({ length: n }, (_, i) => (
      <View key={i} style={[styles.row, i < n - 1 && styles.border]}>
        <Bar w={40} h={40} r={20} />
        <View style={{ flex: 1, gap: 7 }}>
          <Bar w="32%" h={13} />
          <Bar w="58%" h={10} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 7 }}>
          <Bar w={64} h={13} />
          <Bar w={48} h={18} r={9} />
        </View>
      </View>
    ));
  else if (kind === 'cards')
    body = (
      <View style={{ gap: 12 }}>
        {Array.from({ length: n }, (_, i) => (
          <View key={i} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Bar w="30%" h={15} />
              <Bar w="22%" h={15} />
            </View>
            <Bar w="70%" h={10} />
            <Bar w="50%" h={10} />
          </View>
        ))}
      </View>
    );
  else if (kind === 'chart')
    body = (
      <View style={{ height, justifyContent: 'flex-end', gap: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          {[38, 46, 41, 55, 50, 62, 58, 70, 64, 73, 68, 80, 74, 66, 72, 84, 78, 88].map((p, i) => (
            <View key={i} style={{ flex: 1, height: `${p}%`, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.surface2 }} />
          ))}
        </View>
        <Bar w="100%" h={36} r={4} />
      </View>
    );
  else if (kind === 'chips')
    body = (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {Array.from({ length: n }, (_, i) => (
          <View key={i} style={[styles.card, { width: 150 }]}>
            <Bar w="55%" h={11} />
            <Bar w="80%" h={16} />
            <Bar w="40%" h={10} />
          </View>
        ))}
      </View>
    );
  else
    body = (
      <View style={{ gap: 10 }}>
        {Array.from({ length: n }, (_, i) => (
          <Bar key={i} w={i === 0 ? '45%' : i === n - 1 ? '60%' : '100%'} h={i === 0 ? 16 : 11} />
        ))}
      </View>
    );
  return (
    <Animated.View style={{ opacity }} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      {body}
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.hairline },
  }),
);
