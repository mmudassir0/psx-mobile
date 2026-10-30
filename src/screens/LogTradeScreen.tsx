/** Record a buy or sell you made at your broker, typed in or read from a screenshot of the order. */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, space, themed } from '../theme';
import { TradeSheet } from '../ui/TradeSheet';
import { IconButton, T, ScreenHeader } from '../ui/kit';

export default function LogTradeScreen() {
  const nav = useNavigation();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Record a trade" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TradeSheet onDone={() => nav.goBack()} />
        <T v="caption" style={{ lineHeight: 18 }}>
          After a trade in KTrade, take a screenshot of the order confirmation or the executed order, then tap "Fill from a screenshot". Sahm reads it with your AI key (Settings → AI), fills in the trade for you to
          check, and updates your holding and average price when you save.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
  }),
);
