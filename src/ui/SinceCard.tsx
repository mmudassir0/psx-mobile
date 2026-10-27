/** Home: what changed since you last left Sahm. Saves the prices again whenever you leave. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { fmtNum } from '../format';
import { makePref } from '../prefs';
import { awayLabel, sinceLast, type LastLook } from '../portfolio/sinceLast';
import type { Row } from '../portfolio/useReviews';
import type { Stock } from '../psx/types';
import { Panel } from './bits';
import { T } from './kit';

export const lastLookPref = makePref<LastLook | null>('ui.lastLook', null);

export function SinceCard({ rows, watchlist, bySymbol, ready, hidden }: { rows: Row[]; watchlist: string[]; bySymbol: Map<string, Stock>; ready: boolean; hidden?: boolean }) {
  const nav = useNavigation();
  // what was saved when you last left, read once when Sahm opens
  const [last, setLast] = useState<LastLook | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    lastLookPref.get().then(setLast);
  }, []);
  // save the prices when you leave (and keep them current while you're here)
  const latest = useRef<() => LastLook | null>(() => null);
  latest.current = () => {
    const prices: Record<string, number> = {};
    for (const s of [...rows.map((r) => r.holding.symbol), ...watchlist]) {
      const p = bySymbol.get(s)?.price;
      if (p) prices[s] = p;
    }
    return Object.keys(prices).length ? { at: Date.now(), prices } : null;
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'background') return;
      const v = latest.current();
      if (v) lastLookPref.set(v);
    });
    return () => sub.remove();
  }, []);
  // first visit: start from now
  useEffect(() => {
    if (last === null && ready) {
      const v = latest.current();
      if (v) lastLookPref.set(v);
    }
  }, [last, ready]);

  const s = useMemo(
    () =>
      ready && last
        ? sinceLast({
            last,
            now: Date.now(),
            holdings: rows.map((r) => ({ symbol: r.holding.symbol, shares: r.holding.shares })),
            watchlist,
            price: (x) => bySymbol.get(x)?.price ?? null,
            announcements: Object.fromEntries(rows.map((r) => [r.holding.symbol, r.announcements ?? []])),
            payouts: Object.fromEntries(rows.map((r) => [r.holding.symbol, r.dividends?.list ?? []])),
          })
        : null,
    [ready, last, rows, watchlist, bySymbol],
  );
  if (!s || dismissed) return null;
  const up = s.change >= 0;
  return (
    <Panel style={{ paddingVertical: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T v="caption" style={{ flex: 1 }}>
          Since you last looked ({awayLabel(s.hours)} ago)
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={() => setDismissed(true)}>
          <T style={{ fontSize: 13, color: colors.faint }}>✕</T>
        </Pressable>
      </View>
      {s.change !== 0 ? (
        <T style={{ fontFamily: fonts.bold, fontSize: 16, color: up ? colors.up : colors.downText }}>
          {hidden ? '' : `${up ? '+' : '−'}Rs ${fmtNum(Math.abs(Math.round(s.change)), 0)} `}({up ? '+' : '−'}
          {Math.abs(s.pct * 100).toFixed(1)}%) on your holdings
        </T>
      ) : null}
      {s.movers.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {s.movers.map((m) => (
            <Pressable
              key={m.symbol}
              accessibilityRole="button"
              onPress={() => nav.navigate('Stock', { symbol: m.symbol })}
              style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: m.pct >= 0 ? colors.upSoft : colors.downSoft }}
            >
              <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: m.pct >= 0 ? colors.up : colors.downText }}>
                {m.symbol} {m.pct >= 0 ? '+' : '−'}
                {Math.abs(m.pct * 100).toFixed(1)}%{m.held ? '' : ' ☆'}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {s.news.length ? (
        <Pressable accessibilityRole="button" onPress={() => nav.navigate('Announcements')}>
          <T v="caption" numberOfLines={2} style={{ lineHeight: 17 }}>
            📰 {s.news.length} new announcement{s.news.length === 1 ? '' : 's'}:{' '}
            {s.news
              .slice(0, 2)
              .map((n) => `${n.symbol} ${n.title.slice(0, 40)}`)
              .join('; ')}{' '}
            ›
          </T>
        </Pressable>
      ) : null}
      {s.bookClosures.length ? <T v="caption">💸 Book closure passed for {s.bookClosures.map((b) => b.symbol).join(', ')}</T> : null}
    </Panel>
  );
}
