/** "Stocks or savings?": your return next to 12-month T-bills, inflation and the dollar over the same days. */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../theme';
import { useFeedFile } from '../picks/feed';
import { isMacroFeed, type MacroFeed } from '../analysis/macro';
import { compareSavings } from '../analysis/savingsCompare';
import { onSnapshots, snapshots, trackReturns, type Snap } from '../portfolio/track';
import { Panel } from './bits';
import { T } from './kit';
import { GrowBar } from './motion';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

export function SavingsCard() {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const { data: macro } = useFeedFile<MacroFeed>('macro.json', isMacroFeed);
  useEffect(() => {
    snapshots().then(setSnaps);
    return onSnapshots(setSnaps);
  }, []);
  const c = useMemo(() => {
    if (!snaps || snaps.length < 2 || !macro) return null;
    const tr = trackReturns(snaps);
    const last = tr[tr.length - 1];
    return compareSavings(tr[0].day, last.day, last.ret, macro);
  }, [snaps, macro]);
  if (!snaps || !macro) return null;
  if (!c || c.days < 7)
    return (
      <Panel style={{ paddingVertical: 14, gap: 4 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Stocks or savings?</T>
        <T v="caption" style={{ lineHeight: 17 }}>
          After a week of history, this compares your return with T-bills and inflation over the same days.
        </T>
      </Panel>
    );
  const rows = [
    { label: 'Your shares', v: c.mine, strong: true },
    { label: '12-month T-bills', v: c.tbill },
    { label: 'Prices (inflation)', v: c.inflation },
    ...(c.usd != null ? [{ label: 'Dollar', v: c.usd }] : []),
  ];
  const scale = Math.max(0.01, ...rows.map((r) => Math.abs(r.v)));
  const beatBills = c.mine > c.tbill;
  const notes = [
    c.policyUntil ? `Before ${nice(c.policyUntil)} the SBP policy rate stands in for the T-bill yield (12-month bills usually yield within about a point of it).` : null,
    c.tbillAssumedFrom ? `T-bill yields before ${nice(c.tbillAssumedFrom)} are taken as that day's.` : null,
    c.inflationAssumedFrom ? `Inflation from ${MON[Number(c.inflationAssumedFrom.slice(5, 7)) - 1]} on is taken at the latest month's rate until PBS publishes it.` : null,
  ].filter(Boolean);
  return (
    <Panel style={{ paddingVertical: 16, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Stocks or savings?</T>
        <T v="caption">
          Since {nice(c.from)} · {c.days} days
        </T>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="body" style={{ fontSize: 13.5, fontFamily: r.strong ? fonts.semibold : undefined }}>
              {r.label}
            </T>
            <T v="mono" style={{ fontSize: 13.5, color: r.strong ? (r.v >= 0 ? colors.up : colors.downText) : colors.text2 }}>
              {pct(r.v)}
            </T>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
            <GrowBar style={{ height: 6, borderRadius: 3, width: `${Math.min(100, (Math.abs(r.v) / scale) * 100)}%`, backgroundColor: r.strong ? (r.v >= 0 ? colors.up : colors.down) : colors.faint, opacity: r.strong ? 1 : 0.6 }} />
          </View>
        </View>
      ))}
      <T style={{ fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.text }}>
        {beatBills ? 'Ahead of T-bills' : 'Behind T-bills'} by {Math.abs((c.mine - c.tbill) * 100).toFixed(1)} points. After inflation your money {c.real >= 0 ? 'grew' : 'shrank'} {Math.abs(c.real * 100).toFixed(1)}%.
      </T>
      <T v="caption" style={{ lineHeight: 17 }}>
        Your return counts price moves and cash dividends, not the money you added or took out. T-bills before tax, at each day's 12-month yield; inflation from PBS's monthly figures. {notes.join(' ')} The past doesn't promise
        the future. Information, not advice.
      </T>
    </Panel>
  );
}
