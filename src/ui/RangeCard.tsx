/** Where the price is likely to be in a day, a week and a month: an 80% range, not a forecast of direction. */
import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { fmtNum, fmtPrice } from '../format';
import { priceRange } from '../analysis/range';
import { nextRateDecision } from '../analysis/events';
import { Panel } from './bits';
import { T } from './kit';

const H = [
  { days: 1, label: 'Next trading day' },
  { days: 5, label: 'In a week' },
  { days: 21, label: 'In a month' },
];

export function RangeCard({ closes, price, kind }: { closes: number[]; price: number | null; kind: 'stock' | 'index' }) {
  const anchor = price ?? closes[closes.length - 1];
  const rows = H.map((h) => ({ ...h, r: priceRange(closes, h.days, kind) })).filter((x) => x.r);
  if (!rows.length || !(anchor > 0)) return null;
  const fmt = kind === 'index' ? (v: number) => fmtNum(Math.round(v)) : fmtPrice;
  const mpc = nextRateDecision(Date.now(), 3);
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      {rows.map(({ days, label, r }) => {
        const lo = anchor / (1 + r!.pct);
        const hi = anchor * (1 + r!.pct);
        return (
          <View key={days} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="body" style={{ fontSize: 14 }}>
                {label}
              </T>
              <T v="caption">±{(r!.pct * 100).toFixed(1)}%</T>
            </View>
            <T v="mono" style={{ fontSize: 14.5 }}>
              <T v="mono" style={{ fontSize: 14.5, color: colors.downText }}>
                {fmt(lo)}
              </T>
              {'  –  '}
              <T v="mono" style={{ fontSize: 14.5, color: colors.up }}>
                {fmt(hi)}
              </T>
            </T>
          </View>
        );
      })}
      {mpc ? (
        <T v="caption" style={{ lineHeight: 18, color: colors.gold, fontFamily: fonts.semibold }}>
          State Bank rate decision on {new Date(Date.parse(mpc + 'T12:00:00Z')).toUTCString().slice(0, 11).replace(',', '')}: moves around it have been about a fifth bigger than usual.
        </T>
      ) : null}
      <T v="caption" style={{ lineHeight: 18 }}>
        8 times in 10 the price should end up inside these ranges; 1 in 10 below, 1 in 10 above. They come from how much the price has
        been swinging lately, not from which way it will go. Tested on PSX prices from 2017: in 2022–26 the ranges held the actual price
        {kind === 'index' ? ' 76–84%' : ' 83–84%'} of the time.
      </T>
    </Panel>
  );
}
