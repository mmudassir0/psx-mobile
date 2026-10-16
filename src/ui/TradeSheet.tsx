/** Record a buy or sell in a few taps; updates shares and average price. */
import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtNum } from '../format';
import { applyTrade, setHoldings, useHoldings } from '../portfolio/holdings';
import { Panel } from './bits';
import { Button, Segmented, T } from './kit';

export function TradeSheet({ symbol, price, onDone }: { symbol?: string; price?: number | null; onDone: () => void }) {
  const { holdings } = useHoldings();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [sym, setSym] = useState(symbol ?? '');
  const [shares, setShares] = useState('');
  const [px, setPx] = useState(price ? price.toFixed(2) : '');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (price) setPx(price.toFixed(2));
  }, [price]);
  const n = (s: string) => Number(s.replace(/,/g, ''));
  const preview = applyTrade(holdings, { symbol: sym, side, shares: n(shares), price: n(px) });
  const after = preview.error ? null : preview.holdings.find((h) => h.symbol === sym.trim().toUpperCase());
  const save = async () => {
    if (preview.error) return setMsg(preview.error);
    await setHoldings(preview.holdings);
    onDone();
  };
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <Segmented
        options={[
          { key: 'buy', label: 'Bought' },
          { key: 'sell', label: 'Sold' },
        ]}
        value={side}
        onChange={setSide}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={sym} onChangeText={setSym} placeholder="Symbol" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={colors.faint} style={[styles.input, { flex: 1.2 }]} editable={!symbol} />
        <TextInput value={shares} onChangeText={setShares} placeholder="Shares" keyboardType="numeric" placeholderTextColor={colors.faint} style={[styles.input, { flex: 1 }]} />
        <TextInput value={px} onChangeText={setPx} placeholder="Price" keyboardType="decimal-pad" placeholderTextColor={colors.faint} style={[styles.input, { flex: 1 }]} />
      </View>
      {msg || preview.error ? (
        <T v="caption" style={{ color: colors.downText }}>
          {msg ?? (shares || px ? preview.error : '')}
        </T>
      ) : (
        <T v="caption">
          {after ? `After this: ${fmtNum(after.shares, 0)} shares at an average of Rs ${after.avgCost.toFixed(2)}` : `This sells your whole holding`}
          {preview.realised != null ? `; ${preview.realised >= 0 ? 'profit' : 'loss'} of Rs ${fmtNum(Math.abs(preview.realised), 0)} on these shares` : ''}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" tone="ghost" onPress={onDone} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Save" onPress={save} disabled={!!preview.error} />
        </View>
      </View>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    input: { height: 44, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontFamily: fonts.mono, fontSize: 15, color: colors.text },
  }),
);
