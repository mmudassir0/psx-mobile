import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { fmtDateTime, fmtNum, fmtPrice } from '../format';
import { useMarket } from '../store/market';
import { useUser } from '../store/user';
import { Badge, Card, Empty, Icon, T } from '../ui/kit';

export default function TradeScreen() {
  const nav = useNavigation();
  const { stocks } = useMarket();
  const { account, cancelOrder } = useUser();
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return stocks
      .filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
      .sort((a, b) => (a.symbol.startsWith(q) ? 0 : 1) - (b.symbol.startsWith(q) ? 0 : 1))
      .slice(0, 8);
  }, [stocks, query]);

  const open = account.orders.filter((o) => o.status === 'open');
  const history = account.orders.filter((o) => o.status !== 'open').slice(0, 30);

  const confirmCancel = (id: string, label: string) =>
    Alert.alert('Cancel order?', label, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => cancelOrder(id) },
    ]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <T v="h1">Trade</T>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Which stock do you want to trade?"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Search a stock to trade"
          />
        </View>
        {matches.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {matches.map((s, i) => (
              <Pressable
                key={s.symbol}
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  nav.navigate('Order', { symbol: s.symbol, side: 'buy' });
                }}
                style={[styles.match, i < matches.length - 1 && styles.border]}
              >
                <View style={{ flex: 1 }}>
                  <T v="title" style={{ fontSize: 15 }}>
                    {s.symbol}
                  </T>
                  <T v="caption" numberOfLines={1}>
                    {s.name}
                  </T>
                </View>
                <T v="mono">{fmtPrice(s.price)}</T>
                <Icon name="chevron" size={18} color={colors.faint} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        <View style={{ gap: 8 }}>
          <T v="title">Open orders</T>
          {open.length === 0 ? (
            <T v="caption">No open orders. Limit and stop orders wait here until their price is reached.</T>
          ) : (
            open.map((o) => {
              const label = `${o.side === 'buy' ? 'Buy' : 'Sell'} ${fmtNum(o.qty, 0)} ${o.symbol} · ${o.type} ${fmtPrice(o.price)}`;
              return (
                <Card key={o.id} style={styles.orderCard}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Badge label={o.side === 'buy' ? 'Buy' : 'Sell'} tone={o.side === 'buy' ? 'up' : 'down'} />
                      <T v="title" style={{ fontSize: 15 }}>
                        {o.symbol}
                      </T>
                    </View>
                    <T v="caption">
                      {fmtNum(o.qty, 0)} shares · {o.type === 'limit' ? 'Limit' : 'Stop'} {fmtPrice(o.price)}
                    </T>
                    <T v="caption">Placed {fmtDateTime(o.createdAt)}</T>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => confirmCancel(o.id, label)} style={styles.cancel}>
                    <T v="label" style={{ color: colors.downText }}>
                      Cancel
                    </T>
                  </Pressable>
                </Card>
              );
            })
          )}
        </View>

        <View style={{ gap: 4 }}>
          <T v="title">Order history</T>
          {history.length === 0 ? (
            <Empty title="No trades yet" body="Search a stock above, or open one from the Market tab and tap Buy." />
          ) : (
            history.map((o, i) => (
              <View key={o.id} style={[styles.hist, i < history.length - 1 && styles.border]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="body" style={{ fontFamily: fonts.bold }}>
                    {o.side === 'buy' ? 'Buy' : 'Sell'} {fmtNum(o.qty, 0)} {o.symbol}
                  </T>
                  <T v="caption">
                    {fmtDateTime(o.updatedAt)}
                    {o.reason ? ` · ${o.reason}` : ''}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T v="mono" style={{ fontSize: 13 }}>
                    {o.fillPrice != null ? fmtPrice(o.fillPrice) : '—'}
                  </T>
                  <T
                    v="caption"
                    style={{ color: o.status === 'filled' ? colors.up : o.status === 'rejected' ? colors.downText : colors.faint }}
                  >
                    {o.status}
                  </T>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 22, paddingBottom: 36 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 0 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  orderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cancel: { height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
