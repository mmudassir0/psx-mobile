/** Your return against the KSE-100 or KMI-30: your real return since tracking began, and what your current mix did. */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { fmtDay } from '../format';
import type { Candle, SeriesPoint } from '../psx/types';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import { cashDividends } from '../analysis/dividends';
import type { Row } from '../portfolio/useReviews';
import { indexReturns, mixReturns, onSnapshots, shadowIndex, snapshots, trackReturns, type Snap } from '../portfolio/track';
import { Panel } from './bits';
import { BENCH_LABEL, benchmarkPref } from '../portfolio/prefs';
import { Segmented, T } from './kit';
import { Skeleton } from './Skeleton';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');
const pc = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);

function CompareChart({ mine, index, height = 120 }: { mine: (number | null)[]; index: (number | null)[]; height?: number }) {
  const W = 300;
  const all = [...mine, ...index].filter((v): v is number => v != null);
  if (all.length < 2) return null;
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const n = Math.max(mine.length, index.length);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0);
  const y = (v: number) => 4 + ((hi - v) / span) * (height - 8);
  const path = (s: (number | null)[]) => {
    let d = '';
    let pen = false;
    s.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <Path d={`M0 ${y(0)}L${W} ${y(0)}`} stroke={colors.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={path(index)} stroke={colors.faint} strokeWidth={1.5} fill="none" />
        <Path d={path(mine)} stroke={colors.gold} strokeWidth={2} fill="none" />
      </Svg>
      <View style={{ position: 'absolute', right: 0, top: 0 }}>
        <T v="caption" style={{ fontSize: 11 }}>
          {pc(hi, 0)}
        </T>
      </View>
      <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
        <T v="caption" style={{ fontSize: 11 }}>
          {pc(lo, 0)}
        </T>
      </View>
    </View>
  );
}

function Legend({ mine, index, mineLabel, indexLabel }: { mine: number | null; index: number | null; mineLabel: string; indexLabel: string }) {
  const diff = mine != null && index != null ? mine - index : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <View style={{ gap: 2 }}>
          <T v="caption">
            <T style={{ color: colors.gold, fontSize: 13 }}>━ </T>
            {mineLabel}
          </T>
          <T v="mono" style={{ fontSize: 18, color: mine == null ? colors.text : mine >= 0 ? colors.up : colors.downText }}>
            {pc(mine)}
          </T>
        </View>
        <View style={{ gap: 2 }}>
          <T v="caption">
            <T style={{ color: colors.faint, fontSize: 13 }}>━ </T>
            {indexLabel}
          </T>
          <T v="mono" style={{ fontSize: 18 }}>
            {pc(index)}
          </T>
        </View>
      </View>
      {diff != null ? (
        <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: diff >= 0 ? colors.up : colors.downText }}>
          {Math.abs(diff) < 0.005 ? 'About the same as the index' : diff > 0 ? `${pc(diff)} ahead of the index` : `${pc(-diff)} behind the index`}
        </T>
      ) : null}
    </View>
  );
}

/** In rupees: what you have against the same money put into the index on the same days. */
function SameMoney({ s, label }: { s: NonNullable<ReturnType<typeof shadowIndex>>; label: string }) {
  const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;
  const diff = s.mine - s.index;
  return (
    <View style={{ gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.hairline }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Am I beating the market?</T>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <T v="caption">You have</T>
          <T v="mono" style={{ fontSize: 16 }}>
            {rs(s.mine)}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="caption">Same money in {label}</T>
          <T v="mono" style={{ fontSize: 16 }}>
            {rs(s.index)}
          </T>
        </View>
      </View>
      <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: Math.abs(diff) < s.invested * 0.005 ? colors.text2 : diff > 0 ? colors.up : colors.downText }}>
        {Math.abs(diff) < s.invested * 0.005 ? 'About the same as the index.' : diff > 0 ? `${rs(diff)} more than the index would have made.` : `${rs(-diff)} less than the index would have made.`}
      </T>
      <T v="caption" style={{ lineHeight: 17 }}>
        Every rupee you put in since {fmtDay(dayT(s.from))} counted as bought into the index the same day, and money taken out as sold. Yours includes {rs(s.dividends)} of dividends received.
      </T>
    </View>
  );
}

type View_ = 'actual' | 'mix';
const RANGES = [
  { key: '63', label: '3M' },
  { key: '252', label: '1Y' },
  { key: '756', label: '3Y' },
];

export function PerformanceCard({ rows, candles, loading }: { rows: Row[]; candles: Record<string, Candle[] | null>; loading: boolean }) {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  const [view, setView] = useState<View_ | null>(null);
  const [range, setRange] = useState('252');
  const bench = benchmarkPref.use();
  useEffect(() => {
    snapshots().then(setSnaps);
    return onSnapshots(setSnaps);
  }, []);
  useEffect(() => {
    setIndex(null);
    cached<SeriesPoint[]>(`eod:${bench}`, 30 * 60_000, () => fetchSeries('eod', bench), { persist: true })
      .then(setIndex)
      .catch(() => setIndex([]));
  }, [bench]);
  const tracked = useMemo(() => {
    if (!snaps || snaps.length < 2) return null;
    const pts = trackReturns(snaps);
    const days = pts.map((p) => p.day);
    return { days, mine: pts.map((p) => p.ret), index: index ? indexReturns(index, days) : days.map(() => null) };
  }, [snaps, index]);
  const mix = useMemo(() => {
    if (loading || !index?.length) return null;
    const days = index.slice(-(Number(range) + 1)).map((p) => pkDay(p.t));
    const items = rows.map((r) => ({ shares: r.holding.shares, candles: candles[r.holding.symbol] ?? [], cash: cashDividends(r.dividends) }));
    if (items.some((x) => x.candles.length < 2)) return null;
    return { days, mine: mixReturns(items, days), index: indexReturns(index, days) };
  }, [loading, index, range, rows, candles]);
  const shadow = useMemo(() => (snaps && index?.length ? shadowIndex(snaps, index) : null), [snaps, index]);
  const v: View_ = view ?? (tracked && tracked.days.length >= 5 ? 'actual' : 'mix');
  const firstDay = snaps?.[0]?.day;
  const shown = v === 'actual' ? tracked : mix;
  const last = <T,>(a: T[]) => a[a.length - 1] ?? null;

  return (
    <Panel style={{ paddingVertical: 14, gap: 12 }}>
      <Segmented
        options={[
          { key: 'actual', label: 'Your real return' },
          { key: 'mix', label: 'Your current stocks' },
        ]}
        value={v}
        onChange={setView}
      />
      {v === 'mix' ? <Segmented options={RANGES} value={range} onChange={setRange} /> : null}
      <Segmented
        options={[
          { key: 'KSE100', label: 'vs KSE-100' },
          { key: 'KMI30', label: 'vs KMI-30 (Shariah)' },
        ]}
        value={bench}
        onChange={(k) => benchmarkPref.set(k)}
      />
      {v === 'actual' && !tracked ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          {firstDay
            ? `Sahm started tracking your portfolio on ${fmtDay(dayT(firstDay))}. Your real return shows from the next trading day you open the app, and grows from there.`
            : 'Sahm saves a snapshot of your portfolio each day you open the app. Your real return shows from the second day.'}
        </T>
      ) : !shown ? (
        <Skeleton kind="chart" height={120} />
      ) : (
        <>
          <Legend mine={last(shown.mine)} index={last(shown.index)} mineLabel={v === 'actual' ? 'You' : 'Your stocks'} indexLabel={BENCH_LABEL[bench]} />
          <CompareChart mine={shown.mine} index={shown.index} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption">{fmtDay(dayT(shown.days[0]))}</T>
            <T v="caption">{fmtDay(dayT(shown.days[shown.days.length - 1]))}</T>
          </View>
          {v === 'actual' && shadow ? <SameMoney s={shadow} label={BENCH_LABEL[bench]} /> : null}
        </>
      )}
      <T v="caption" style={{ lineHeight: 18 }}>
        {v === 'actual'
          ? "Money you add or take out isn't counted as gain or loss: buys, sales and bonus shares are worked out from how your holdings change between days. Cash dividends count, before tax, as they do in the KSE-100. The KMI-30 is the fairer yardstick if you only buy Shariah-compliant shares. Each day is linked to the next, the way funds report returns."
          : 'If you had owned the shares you hold now for the whole period, dividends included. Not your actual return (you may have bought later), but a fair check of the stocks you chose against simply owning the index.'}
      </T>
    </Panel>
  );
}
