import React, { useMemo } from 'react';
import { View } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { Stock } from '../../psx/types';
import { useMarket } from '../../store/market';
import { StockRow } from '../../ui/StockRow';
import { Empty, T } from '../../ui/kit';

/** Other listed companies in the same sector, largest first. */
export function PeersTab({ stock }: { stock: Stock | undefined }) {
  const nav = useNavigation();
  const { stocks } = useMarket();
  const peers = useMemo(
    () =>
      stock
        ? stocks
            .filter((s) => s.sector === stock.sector && s.symbol !== stock.symbol && s.price != null)
            .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
        : [],
    [stocks, stock],
  );
  if (!stock) return <T v="caption">Loading market data…</T>;
  if (!peers.length) return <Empty title="No peers" body={`No other listed companies in ${stock.sector}.`} />;
  return (
    <View style={{ gap: 6 }}>
      <T v="caption">
        {peers.length} other {peers.length === 1 ? 'company' : 'companies'} in {stock.sector}, by market value
      </T>
      <View>
        {peers.map((p, i) => (
          <StockRow
            key={p.symbol}
            stock={p}
            last={i === peers.length - 1}
            onPress={() => nav.dispatch(StackActions.push('Stock', { symbol: p.symbol }))}
          />
        ))}
      </View>
    </View>
  );
}
