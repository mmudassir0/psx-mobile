/** Record a buy or sell in a few taps; updates shares and average price. */
import React, { useEffect, useState } from 'react';
import { useFlag } from '../flags';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { readTradeScreenshots, type ReadTrade } from '../portfolio/screenshot';
import { pickConfirmation } from '../portfolio/tradeShot';
import { useMarket } from '../store/market';
import { aiKeys } from '../store/ai';
import { colors, fonts, themed } from '../theme';
import { fmtNum } from '../format';
import { applyTrade, setHoldings, useHoldings } from '../portfolio/holdings';
import { boughtPref, taxStatusPref } from '../portfolio/prefs';
import { heldSince2023, saleLine, saleTax } from '../portfolio/tax';
import { logTrade } from '../portfolio/trades';
import { breakEven, costsPref, tradeCost } from '../portfolio/costs';
import { pkToday } from '../journal/store';
import { Panel } from './bits';
import { Button, Segmented, T } from './kit';

export function TradeSheet({ symbol, price, onDone }: { symbol?: string; price?: number | null; onDone: () => void }) {
  const { holdings } = useHoldings();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [sym, setSym] = useState(symbol ?? '');
  const [shares, setShares] = useState('');
  const [px, setPx] = useState(price ? price.toFixed(2) : '');
  const [msg, setMsg] = useState<string | null>(null);
  const [day, setDay] = useState(pkToday());
  const [reading, setReading] = useState<string | null>(null);
  const [choices, setChoices] = useState<ReadTrade[]>([]);
  const { bySymbol } = useMarket();
  const fill = (t: ReadTrade) => {
    setSide(t.side);
    if (!symbol) setSym(t.symbol);
    setShares(String(t.shares));
    setPx(String(t.price));
    setDay(t.date);
    setChoices([]);
    setReading(`Filled from the screenshot: check it and Save.`);
  };
  const fromShot = async () => {
    setMsg(null);
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, base64: true, quality: 0.6 });
    if (p.canceled || !p.assets[0]?.base64) return;
    setReading('Reading the screenshot…');
    try {
      const r = await readTradeScreenshots(await aiKeys(), [{ data: p.assets[0].base64, mime: p.assets[0].mimeType ?? 'image/jpeg' }], bySymbol.size ? (s) => bySymbol.has(s) : undefined, setReading);
      const pick = pickConfirmation(r.trades, symbol ?? null);
      if (pick.one) fill(pick.one);
      else if (pick.many.length) {
        setChoices(pick.many);
        setReading('Several trades on it: tap the one to record.');
      } else setReading(`No trade found${symbol ? ` for ${symbol}` : ''}${r.rejected.length ? `: ${r.rejected.slice(0, 3).join('; ')}` : ''}.`);
    } catch (e) {
      setReading((e as Error).message);
    }
  };
  const tax = taxStatusPref.use();
  const taxOn = useFlag('tax');
  const bought = boughtPref.use();
  const costs = costsPref.use();
  useEffect(() => {
    if (price) setPx(price.toFixed(2));
  }, [price]);
  const n = (s: string) => Number(s.replace(/,/g, ''));
  const preview = applyTrade(holdings, { symbol: sym, side, shares: n(shares), price: n(px) });
  const held = holdings.find((h) => h.symbol === sym.trim().toUpperCase());
  const sale = taxOn && side === 'sell' && held && n(shares) > 0 && n(px) > 0 && !preview.error ? saleTax(n(shares), n(px), held.avgCost, tax, bought[held.symbol], heldSince2023()) : null;
  const after = preview.error ? null : preview.holdings.find((h) => h.symbol === sym.trim().toUpperCase());
  const save = async () => {
    if (preview.error) return setMsg(preview.error);
    const symU = sym.trim().toUpperCase();
    await logTrade({ day: day <= pkToday() ? day : pkToday(), symbol: symU, side, shares: n(shares), price: n(px), avgCost: held?.avgCost ?? n(px), realised: preview.realised });
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
      <Pressable accessibilityRole="button" onPress={fromShot} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>📷 Fill from a screenshot of the order</T>
      </Pressable>
      {reading ? <T v="caption">{reading}</T> : null}
      {choices.length ? (
        <View style={{ gap: 6 }}>
          {choices.map((t, i) => (
            <Pressable key={`${t.date}${t.symbol}${t.side}${t.shares}${t.price}${i}`} accessibilityRole="button" onPress={() => fill(t)} style={styles.choice}>
              <T style={{ fontSize: 13.5 }}>
                {t.date} · {t.side === 'buy' ? 'Bought' : 'Sold'} {fmtNum(t.shares, 0)} {t.symbol} at {t.price.toFixed(2)}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {day !== pkToday() ? <T v="caption">Trade date {day}</T> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={sym} onChangeText={setSym} placeholder="Symbol" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={colors.faint} style={[styles.input, { flex: 1.2 }]} editable={!symbol} />
        <TextInput value={shares} onChangeText={setShares} placeholder="Shares" keyboardType="numeric" placeholderTextColor={colors.faint} style={[styles.input, { flex: 1 }]} />
        <TextInput value={px} onChangeText={setPx} placeholder="Price" keyboardType="decimal-pad" placeholderTextColor={colors.faint} style={[styles.input, { flex: 1 }]} />
      </View>
      {msg || (preview.error && shares) ? (
        <T v="caption" style={{ color: colors.downText }}>
          {msg ?? (shares ? preview.error : '')}
        </T>
      ) : (
        <T v="caption">
          {!shares ? 'Enter the number of shares and the price you traded at.' : after ? `After this: ${fmtNum(after.shares, 0)} shares at an average of Rs ${after.avgCost.toFixed(2)}` : `This sells your whole holding`}
          {preview.realised != null ? `; ${preview.realised >= 0 ? 'profit' : 'loss'} of Rs ${fmtNum(Math.abs(preview.realised), 0)} on these shares` : ''}
        </T>
      )}
      {sale ? (
        <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
          {saleLine(sale, (v) => fmtNum(v, 0))}
        </T>
      ) : null}
      {n(shares) > 0 && n(px) > 0 && !preview.error ? <CostLine side={side} shares={n(shares)} price={n(px)} costs={costs} /> : null}
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
    choice: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line },
    input: { minWidth: 0, flexBasis: 0, height: 44, borderRadius: 10, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontFamily: fonts.mono, fontSize: 15, color: colors.text },
  }),
);

/** The broker's and the market's charges on this trade, and for a buy the price it must reach to come out even. */
function CostLine({ side, shares, price, costs }: { side: 'buy' | 'sell'; shares: number; price: number; costs: Parameters<typeof tradeCost>[2] }) {
  const c = tradeCost(shares, price, costs);
  const r = (v: number) => fmtNum(v, 0);
  return (
    <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
      Charges about Rs {r(c.total)} ({(c.pct * 100).toFixed(2)}%: brokerage Rs {r(c.brokerage)}, sales tax Rs {r(c.salesTax)}, PSX, CDC and others Rs {r(c.exchange)}).
      {side === 'buy'
        ? ` You need to sell above Rs ${breakEven(shares, price, costs).toFixed(2)} to come out ahead after both trades' charges.`
        : ` You'd receive about Rs ${r(c.value - c.total)} before capital gains tax.`}
    </T>
  );
}
