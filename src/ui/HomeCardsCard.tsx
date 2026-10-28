/** Settings → Home: show or hide each Home card and move it up or down. */
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { HOME_CARDS, homeCardsPref, isHidden, move, orderOf, toggle } from '../nav/homeCards';
import { T } from './kit';

export function HomeCardsCard() {
  const l = homeCardsPref.use();
  const order = orderOf(l);
  const label = (k: string) => HOME_CARDS.find((c) => c.key === k)?.label ?? k;
  return (
    <View style={styles.card}>
      {order.map((k, i) => {
        const on = !isHidden(l, k);
        return (
          <View key={k} style={[styles.row, i < order.length - 1 && styles.border]}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Arrow label="▲" disabled={i === 0} onPress={() => homeCardsPref.set(move(l, k, -1))} />
              <Arrow label="▼" disabled={i === order.length - 1} onPress={() => homeCardsPref.set(move(l, k, 1))} />
            </View>
            <T v="body" style={{ flex: 1, color: on ? colors.text : colors.faint }}>
              {label(k)}
            </T>
            <Switch value={on} onValueChange={() => homeCardsPref.set(toggle(l, k))} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
          </View>
        );
      })}
      <T v="caption" style={{ lineHeight: 17, paddingTop: 8 }}>
        For the Tabs layout. Your portfolio stays at the top. Feature switches above still hide a card everywhere.
      </T>
    </View>
  );
}

function Arrow({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label === '▲' ? 'Move up' : 'Move down'} disabled={disabled} onPress={onPress} hitSlop={4} style={[styles.arrow, disabled && { opacity: 0.25 }]}>
      <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.text2 }}>{label}</T>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    arrow: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  }),
);
