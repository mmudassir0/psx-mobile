import React, { useMemo } from 'react';
import { View } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { Stock } from '../../psx/types';
import { useMarket } from '../../store/market';
import { StockRow } from '../../ui/StockRow';
import { Empty, T } from '../../ui/kit';
import { Panel } from '../../ui/bits';
import { colors, fonts } from '../../theme';
import { peerCompare, type PeerFigures } from '../../analysis/peers';
import { roeOf } from '../../analysis/screener';
import { balanceSheetFor } from '../../analysis/ratios';
import { Explain } from '../../ui/Explain';

const fig = (s: Stock): PeerFigures => ({ symbol: s.symbol, pe: s.pe, divYield: s.divYield, change1y: s.change1y, roe: roeOf(s, balanceSheetFor(s.symbol)), marketCap: s.marketCap });
const show = (k: string, v: number | null) => (v == null ? '–' : k === 'pe' ? v.toFixed(1) : `${k === 'roe' ? (v * 100).toFixed(0) : v.toFixed(1)}%`);

/** Other listed companies in the same sector, largest first. */
export function PeersTab({ stock }: { stock: Stock | undefined }) {
  const nav = useNavigation();
  const { stocks } = useMarket();
  const peers = useMemo(() => (stock ? stocks.filter((s) => s.sector === stock.sector && s.symbol !== stock.symbol && s.price != null).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) : []), [stocks, stock]);
  const cmp = useMemo(() => (stock && peers.length ? peerCompare(fig(stock), peers.map(fig)) : null), [stock, peers]);
  if (!stock) return <T v="caption">Loading market data…</T>;
  if (!peers.length) return <Empty title="No peers" body={`No other listed companies in ${stock.sector}.`} />;
  return (
    <View style={{ gap: 6 }}>
      {cmp ? (
        <Panel style={{ paddingVertical: 12, gap: 8, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 14, flex: 1 }}>Against its sector</T>
            <Explain id="pe" />
          </View>
          {cmp.verdict ? (
            <T v="body" style={{ fontSize: 14, lineHeight: 20, color: cmp.verdict === 'cheap' ? colors.up : cmp.verdict === 'dear' ? colors.downText : colors.text }}>
              {cmp.verdict === 'cheap'
                ? `Looks cheap for its sector: a lower P/E than most of its ${peers.length} peers${cmp.measures[1].beats != null && cmp.measures[1].beats > 0.5 ? ' and a higher dividend yield' : ''}.`
                : cmp.verdict === 'dear'
                  ? 'Priced above most of its sector: a higher P/E than most peers. The market may expect more growth, or it may be expensive.'
                  : 'Priced about like the rest of its sector.'}
            </T>
          ) : null}
          {cmp.measures.map((m) => (
            <View key={m.key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T v="caption" style={{ flex: 1 }}>
                {m.label}
              </T>
              <T v="mono" style={{ fontSize: 13.5, width: 64, textAlign: 'right' }}>
                {show(m.key, m.value)}
              </T>
              <T v="caption" style={{ width: 92, textAlign: 'right' }}>
                sector {show(m.key, m.median)}
              </T>
              <T v="caption" style={{ width: 54, textAlign: 'right', color: m.beats == null ? colors.faint : m.beats >= 0.67 ? colors.up : m.beats <= 0.33 ? colors.downText : colors.text2 }}>
                {m.rank != null && m.n ? `#${m.rank}/${m.n + 1}` : '–'}
              </T>
            </View>
          ))}
          <T v="caption" style={{ lineHeight: 17 }}>
            #1 is the lowest P/E, or the highest yield, change or ROE. {cmp.size.rank ? `${cmp.size.rank === 1 ? 'The biggest' : `Number ${cmp.size.rank} by size`} of ${cmp.size.of}.` : ''} ROE is known for KSE-100 and
            KMI-30 members only. A sector median, not advice.
          </T>
        </Panel>
      ) : null}
      <T v="caption">
        {peers.length} other {peers.length === 1 ? 'company' : 'companies'} in {stock.sector}, by market value
      </T>
      <View>
        {peers.map((p, i) => (
          <StockRow
            key={p.symbol}
            stock={p}
            last={i === peers.length - 1}
            sub={`P/E ${show('pe', p.pe != null && p.pe >= 1 ? p.pe : null)} · yield ${show('divYield', p.divYield)} · 1y ${show('change1y', p.change1y)}`}
            onPress={() => nav.dispatch(StackActions.push('Stock', { symbol: p.symbol }))}
          />
        ))}
      </View>
    </View>
  );
}
