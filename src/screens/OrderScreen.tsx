import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, fonts } from '../theme';
import { fmtNum, fmtPkr, fmtPrice } from '../format';
import { useMarket, useStock } from '../store/market';
import { useUser } from '../store/user';
import { availableShares, buyingPower, FEE_RATE, Order, OrderType, Side } from '../paper/engine';
import { Badge, Button, Card, Change, IconButton, Segmented, T } from '../ui/kit';

function tick(price: number) {
  if (price >= 1000) return 1;
  if (price >= 100) return 0.1;
  if (price >= 10) return 0.05;
  return 0.01;
}

function Stepper({
  label,
  value,
  onChange,
  onStep,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (dir: 1 | -1) => void;
  keyboard: 'decimal-pad' | 'number-pad';
}) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <T v="label">{label}</T>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onStep(-1)} style={styles.stepBtn}>
          <T style={{ fontSize: 22, color: colors.text }}>−</T>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboard}
          style={styles.stepInput}
          accessibilityLabel={label}
          selectTextOnFocus
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onStep(1)} style={styles.stepBtn}>
          <T style={{ fontSize: 22, color: colors.text }}>+</T>
        </Pressable>
      </View>
    </View>
  );
}

export default function OrderScreen() {
  const nav = useNavigation();
  const params = useRoute<RouteProp<RootParams, 'Order'>>().params;
  const symbol = params.symbol;
  const stock = useStock(symbol);
  const { marketOpen } = useMarket();
  const { account, placeOrder } = useUser();
  const last = stock?.price ?? null;

  const [side, setSide] = useState<Side>(params.side ?? 'buy');
  const [type, setType] = useState<OrderType>('market');
  const [priceText, setPriceText] = useState(last != null ? last.toFixed(2) : '');
  const [qtyText, setQtyText] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  const qty = Math.floor(Number(qtyText.replace(/[^0-9]/g, '')) || 0);
  const limit = Number(priceText.replace(/[^0-9.]/g, '')) || 0;
  const execPrice = type === 'market' ? last ?? 0 : limit;
  const value = execPrice * qty;
  const fee = value * FEE_RATE;
  const bp = buyingPower(account);
  const held = availableShares(account, symbol);
  const maxQty = side === 'buy' ? (execPrice > 0 ? Math.floor(bp / (execPrice * (1 + FEE_RATE))) : 0) : held;

  const problem = useMemo(() => {
    if (qty < 1) return 'Enter a quantity';
    if (type !== 'market' && limit <= 0) return 'Enter a price';
    if (side === 'buy' && value + fee > bp + 0.005) return 'Not enough buying power';
    if (side === 'sell' && held === 0) return `You don't hold ${symbol}`;
    if (side === 'sell' && qty > held) return `You can sell up to ${held} shares`;
    return null;
  }, [qty, type, limit, side, value, fee, bp, held, symbol]);

  const stepPrice = (dir: 1 | -1) => {
    const base = limit || last || 0;
    const t = tick(base);
    setPriceText(Math.max(t, Math.round((base + dir * t) / t) * t).toFixed(2));
  };
  const stepQty = (dir: 1 | -1) => {
    const step = qty >= 1000 ? 100 : qty >= 100 ? 10 : 1;
    setQtyText(String(Math.max(1, qty + dir * step)));
  };

  const submit = () => {
    setError(null);
    const res = placeOrder({ symbol, side, type, qty, price: type === 'market' ? undefined : limit });
    if (!res.ok) setError(res.error);
    else setPlaced(res.order);
  };

  if (placed) {
    const filled = placed.status === 'filled';
    return (
      <SafeAreaView style={styles.root}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Badge label={filled ? 'Filled' : placed.status === 'open' ? 'Waiting for price' : placed.status} tone={filled ? 'up' : 'gold'} />
          <T v="h1" style={{ textAlign: 'center' }}>
            {filled
              ? `${placed.side === 'buy' ? 'Bought' : 'Sold'} ${fmtNum(placed.qty, 0)} ${symbol}`
              : `${placed.type === 'limit' ? 'Limit' : 'Stop'} order placed`}
          </T>
          <T v="body" style={{ textAlign: 'center', color: colors.muted }}>
            {filled
              ? `at ${fmtPrice(placed.fillPrice)} · commission ${fmtNum(placed.fee ?? 0)}`
              : `${placed.side === 'buy' ? 'Buy' : 'Sell'} ${fmtNum(placed.qty, 0)} when the price ${
                  (placed.type === 'limit') === (placed.side === 'buy') ? 'falls to' : 'rises to'
                } ${fmtPrice(placed.price)}. It fills automatically while the app is open.`}
          </T>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Button label="View portfolio" onPress={() => nav.navigate('Tabs', { screen: filled ? 'Portfolio' : 'Trade' })} />
            <Button label="Done" tone="ghost" onPress={() => nav.goBack()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <IconButton name="close" label="Close order ticket" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 17 }}>
          New order
        </T>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.between}>
            <View style={{ gap: 2, flex: 1 }}>
              <T v="title">{symbol}</T>
              <T v="caption" numberOfLines={1}>
                {stock?.name ?? ''}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T v="mono" style={{ fontSize: 16 }}>
                {fmtPrice(last)}
              </T>
              <Change pct={stock?.changePct} />
            </View>
          </Card>

          <Segmented
            options={[
              { key: 'buy', label: 'Buy' },
              { key: 'sell', label: 'Sell' },
            ]}
            value={side}
            onChange={setSide}
            colorFor={(k) => (k === 'buy' ? colors.up : colors.down)}
          />

          <View style={{ gap: 8 }}>
            <T v="label">Order type</T>
            <Segmented
              options={[
                { key: 'market', label: 'Market' },
                { key: 'limit', label: 'Limit' },
                { key: 'stop', label: 'Stop-loss' },
              ]}
              value={type}
              onChange={setType}
            />
            <T v="caption" style={{ lineHeight: 18 }}>
              {type === 'market'
                ? 'Fills right away at the latest traded price.'
                : type === 'limit'
                  ? side === 'buy'
                    ? 'Buys only if the price falls to your limit or lower.'
                    : 'Sells only if the price rises to your limit or higher.'
                  : side === 'sell'
                    ? 'Sells if the price drops to your stop, to limit a loss.'
                    : 'Buys if the price rises to your stop.'}
            </T>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {type !== 'market' ? (
              <Stepper label={type === 'limit' ? 'Limit price' : 'Stop price'} value={priceText} onChange={setPriceText} onStep={stepPrice} keyboard="decimal-pad" />
            ) : null}
            <Stepper label="Shares" value={qtyText} onChange={setQtyText} onStep={stepQty} keyboard="number-pad" />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0.25, 0.5, 1].map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                onPress={() => setQtyText(String(Math.max(1, Math.floor(maxQty * f))))}
                style={styles.quick}
              >
                <T v="label">{f === 1 ? 'Max' : `${f * 100}%`}</T>
              </Pressable>
            ))}
          </View>

          <Card style={{ gap: 10 }}>
            <View style={styles.between}>
              <T v="caption" style={{ color: colors.muted, fontSize: 13 }}>
                Estimated value
              </T>
              <T v="mono">{fmtPkr(value, 2)}</T>
            </View>
            <View style={styles.between}>
              <T v="caption" style={{ color: colors.muted, fontSize: 13 }}>
                Commission estimate ({(FEE_RATE * 100).toFixed(2)}%)
              </T>
              <T v="mono">{fmtNum(fee)}</T>
            </View>
            <View style={styles.between}>
              <T v="caption" style={{ color: colors.muted, fontSize: 13 }}>
                {side === 'buy' ? 'Buying power' : 'Shares available'}
              </T>
              <T v="mono">{side === 'buy' ? fmtPkr(bp, 2) : fmtNum(held, 0)}</T>
            </View>
          </Card>

          {!marketOpen ? (
            <T v="caption" style={{ lineHeight: 18 }}>
              The market is closed. Market orders fill at the last traded price; limit and stop orders wait for live prices.
            </T>
          ) : null}
          {error || problem ? (
            <T v="caption" style={{ color: colors.downText, fontSize: 13 }}>
              {error ?? problem}
            </T>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            label={`Place paper ${side} order`}
            tone={side === 'buy' ? 'up' : 'down'}
            disabled={!!problem || last == null}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 18, paddingBottom: 24 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepBtn: { width: 46, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: fonts.monoBold, fontSize: 16, paddingVertical: 0 },
  quick: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.navLine, backgroundColor: colors.nav },
});
