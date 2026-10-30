/** Side menu layout: a ☰ button on every main screen opens a list of every tool. */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fonts, themed } from '../theme';
import { GROUPS, visibleFeatures } from '../nav/features';
import { useFlags } from '../flags';
import { T } from './kit';
import { ToolIcon, toolGlyph } from './ToolIcon';

export function MenuButton({ navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const features = visibleFeatures(useFlags());
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Menu" onPress={() => setOpen(true)} style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }, pressed && { opacity: 0.85 }]}>
        <ToolIcon name="menu" size={24} color={colors.onGold} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 8 }}>
              <T style={{ fontFamily: fonts.heavy, fontSize: 22 }}>Sahm</T>
              <Pressable accessibilityRole="button" accessibilityLabel="Close menu" hitSlop={10} onPress={() => setOpen(false)}>
                <ToolIcon name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}>
              {GROUPS.filter((g) => features.some((f) => f.group === g)).map((g) => (
                <View key={g} style={{ marginTop: 10 }}>
                  <T v="caption" style={{ fontFamily: fonts.bold, paddingHorizontal: 10, paddingBottom: 4 }}>
                    {g}
                  </T>
                  {features
                    .filter((f) => f.group === g)
                    .map((f) => (
                      <Pressable
                        key={f.key}
                        accessibilityRole="button"
                        onPress={() => {
                          setOpen(false);
                          f.go(navigation as never);
                        }}
                        style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surface2 }]}
                      >
                        <View style={{ width: 28 }}>
                          <ToolIcon name={toolGlyph(f.key, f.group)} size={20} />
                        </View>
                        <T style={{ fontFamily: fonts.semibold, fontSize: 15 }}>{f.label}</T>
                      </Pressable>
                    ))}
                </View>
              ))}
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1 }} accessibilityLabel="Close menu" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 18,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
    panel: { width: '82%', maxWidth: 360, backgroundColor: colors.ground, borderRightWidth: 1, borderRightColor: colors.line },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  }),
);
