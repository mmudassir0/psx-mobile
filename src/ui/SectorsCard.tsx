/** Which sectors are leading and lagging, from prices and volume (no news needed). */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import type { SectorStat } from '../analysis/market';
import { shortSector } from '../sectors';
import { Panel } from './bits';
import { Segmented, T } from './kit';

const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

function Row({ s, k, last }: { s: SectorStat; k: 'r1w' | 'r1m'; last: boolean }) {
  const v = s[k];
  return (
    <View style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontSize: 14.5, fontFamily: fonts.semibold }} numberOfLines={1}>
          {shortSector(s.name)}
        </T>
        <T v="caption">
          {Math.round(s.up * 100)}% of {s.n} in uptrends · volume {s.vol.toFixed(1)}×{s.vol >= 1.5 ? ' (heavy)' : ''}
        </T>
      </View>
      <T v="mono" style={{ fontSize: 15, color: v >= 0 ? colors.up : colors.downText }}>
        {pc(v)}
      </T>
    </View>
  );
}

export function SectorsCard({ sectors }: { sectors: SectorStat[] }) {
  const [k, setK] = useState<'r1m' | 'r1w'>('r1m');
  const sorted = [...sectors].sort((a, b) => b[k] - a[k]);
  const lead = sorted.slice(0, 5);
  const lag = sorted.slice(-5).reverse();
  return (
    <View style={{ gap: 10 }}>
      <Segmented
        options={[
          { key: 'r1m', label: 'Past month' },
          { key: 'r1w', label: 'Past week' },
        ]}
        value={k}
        onChange={setK}
      />
      <T v="label">Leading</T>
      <Panel>
        {lead.map((s, i) => (
          <Row key={s.name} s={s} k={k} last={i === lead.length - 1} />
        ))}
      </Panel>
      <T v="label">Lagging</T>
      <Panel>
        {lag.map((s, i) => (
          <Row key={s.name} s={s} k={k} last={i === lag.length - 1} />
        ))}
      </Panel>
      <T v="caption" style={{ lineHeight: 18 }}>
        Average move of each sector's stocks that trade at least Rs 5M a day. A sector rising on heavy volume with most of its stocks
        in uptrends usually means buyers know something; check its stocks' announcements for the reason.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
