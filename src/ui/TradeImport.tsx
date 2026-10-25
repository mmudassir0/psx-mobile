/** Import past trades from screenshots of the broker's trade or order history: dated buys and sells for tax and records. */
import React, { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts } from '../theme';
import { fmtNum } from '../format';
import { readTradeScreenshots, type ReadTrade } from '../portfolio/screenshot';
import { mergeTrades, replayTrades } from '../portfolio/trades';
import { boughtPref } from '../portfolio/prefs';
import { BOUGHT_LABEL } from '../portfolio/tax';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { aiKeys } from '../store/ai';
import { Panel } from './bits';
import { Button, T } from './kit';

export function TradeImport() {
  const { holdings } = useHoldings();
  const { bySymbol } = useMarket();
  const bought = boughtPref.use();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [read, setRead] = useState<{ trades: ReadTrade[]; rejected: string[] } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = async () => {
    setDone(null);
    setStatus(null);
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, base64: true, quality: 0.6 });
    if (p.canceled || !p.assets.length) return;
    setBusy(true);
    try {
      const images = p.assets.filter((a) => a.base64).map((a) => ({ data: a.base64 as string, mime: a.mimeType ?? 'image/jpeg' }));
      const r = await readTradeScreenshots(await aiKeys(), images, bySymbol.size ? (s) => bySymbol.has(s) : undefined, setStatus);
      setRead(r);
      setStatus(r.trades.length ? null : `No trades found${r.rejected.length ? `: ${r.rejected.slice(0, 4).join('; ')}` : ''}.`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const replay = read?.trades.length ? replayTrades(read.trades) : null;
  const held = new Map(holdings.map((h) => [h.symbol, h.shares]));
  const matches = replay ? holdings.filter((h) => replay.positions.get(h.symbol)?.shares === h.shares) : [];
  const mismatches = replay ? holdings.filter((h) => replay.positions.has(h.symbol) && replay.positions.get(h.symbol)!.shares !== h.shares) : [];

  const save = async () => {
    if (!replay) return;
    const added = await mergeTrades(replay.records);
    // buy dates only where the history fully explains the shares you hold
    const next = { ...bought };
    for (const h of matches) next[h.symbol] = replay.bought.get(h.symbol) ?? 'recent';
    await boughtPref.set(next);
    setDone(`Saved ${added} new trade${added === 1 ? '' : 's'}${matches.length ? `; buy dates set for ${matches.length} holding${matches.length === 1 ? '' : 's'}` : ''}.`);
    setRead(null);
  };

  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <T v="caption" style={{ lineHeight: 18 }}>
        Screenshots of your broker's trade or order history (with dates) give Sahm your past buys and sells: profit on each sale, this
        tax year's gains, and when the shares you hold were bought, which sets the right capital gains rate. Your holdings above aren't
        changed.
      </T>
      <Button label={busy ? 'Reading…' : 'Read trade history screenshots'} tone="ghost" disabled={busy} onPress={pick} />
      {status ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          {status}
        </T>
      ) : null}
      {replay && read ? (
        <View style={{ gap: 6 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>
            {read.trades.length} trades, {read.trades[0].date} to {read.trades[read.trades.length - 1].date}
          </T>
          {read.trades.slice(-8).map((t) => (
            <T key={`${t.date}${t.symbol}${t.side}${t.shares}${t.price}`} v="caption">
              {t.date} · {t.side === 'buy' ? 'Bought' : 'Sold'} {fmtNum(t.shares, 0)} {t.symbol} at {t.price.toFixed(2)}
            </T>
          ))}
          {read.trades.length > 8 ? <T v="caption">…and {read.trades.length - 8} earlier</T> : null}
          {matches.length ? (
            <T v="caption" style={{ color: colors.up, lineHeight: 18 }}>
              Matches your holdings exactly: {matches.map((h) => `${h.symbol} (${BOUGHT_LABEL[replay.bought.get(h.symbol) ?? 'recent']})`).join(', ')}.
            </T>
          ) : null}
          {mismatches.length ? (
            <T v="caption" style={{ color: colors.gold, lineHeight: 18 }}>
              Doesn't add up to what you hold, so buy dates are left as they are:{' '}
              {mismatches.map((h) => `${h.symbol} (history ${replay.positions.get(h.symbol)!.shares}, you hold ${held.get(h.symbol)})`).join(', ')}. Older
              trades are probably missing; add more screenshots going further back.
            </T>
          ) : null}
          {read.rejected.length ? <T v="caption">Skipped: {read.rejected.slice(0, 5).join('; ')}</T> : null}
          <T v="caption" style={{ lineHeight: 18 }}>
            Check these against your broker before saving: the AI can misread a number.
          </T>
          <Button label={`Save ${read.trades.length} trades`} onPress={save} />
        </View>
      ) : null}
      {done ? (
        <T v="caption" style={{ color: colors.up }}>
          {done}
        </T>
      ) : null}
    </Panel>
  );
}
