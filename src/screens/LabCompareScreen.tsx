/** Up to three strategies side by side: growth of Rs 100, falls and the key numbers. */
import React, { useEffect, useMemo, useState } from 'react';
import { runCached } from '../lab/cache';
import { InteractionManager, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { findStrategy, holdingsStrategy, labStrategiesPref, useLab } from '../lab/store';
import { useHoldings } from '../portfolio/holdings';
import type { Result, Strategy } from '../lab/engine';
import { TEMPLATES } from '../lab/templates';
import { LabChart } from '../ui/LabChart';
import { MixSection } from '../ui/LabExtras';
import { Panel } from '../ui/bits';
import { Chip, Empty, IconButton, Loading, Section, T } from '../ui/kit';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
const COLORS = [() => colors.gold, () => colors.shariah, () => colors.up];

export default function LabCompareScreen() {
  const nav = useNavigation();
  const params = useRoute<RouteProp<RootParams, 'LabCompare'>>().params;
  const mine = labStrategiesPref.use();
  const { lab, busy } = useLab();
  const [ids, setIds] = useState<string[]>(params?.ids?.slice(0, 3) ?? []);
  const [runs, setRuns] = useState<{ s: Strategy; r: Result }[] | null>(null);
  const { holdings } = useHoldings();
  const mineHold = useMemo(() => holdingsStrategy(holdings.map((h) => h.symbol)), [holdings]);
  const choices = useMemo(() => [...(mineHold ? [mineHold] : []), ...mine, ...TEMPLATES.map((t) => t.strategy)], [mine, mineHold]);
  useEffect(() => {
    if (!lab) return;
    setRuns(null);
    const task = InteractionManager.runAfterInteractions(() => {
      const out: { s: Strategy; r: Result }[] = [];
      for (const id of ids) {
        const s = findStrategy(id, mine);
        if (s) out.push({ s, r: runCached(lab, s) });
      }
      setRuns(out);
    });
    return () => task.cancel();
  }, [lab, ids, mine]);

  // the runs can start on different days: show the common span
  const span = useMemo(() => {
    if (!runs?.length || !lab) return null;
    const start = Math.max(...runs.map((x) => x.r.start));
    const days = lab.days.slice(start);
    const rebase = (g: Float64Array, s0: number) => {
      const off = start - s0;
      const b = g[off];
      return Float64Array.from(g.subarray(off), (v) => (v / b) * 100);
    };
    return {
      start,
      days,
      series: runs.map((x, k) => ({ name: x.s.name, values: rebase(x.r.growth, x.r.start), color: COLORS[k](), width: 2 })),
      bench: { name: 'KSE-100', values: rebase(runs[0].r.benchGrowth, runs[0].r.start), color: colors.muted, width: 1.3, dash: '4 3' },
    };
  }, [runs, lab]);

  const mixList = useMemo(() => (runs ?? []).map((x) => x.s), [runs]);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= 3 ? [...x.slice(1), id] : [...x, id]));
  const rows: { k: string; f: (r: Result) => string; c?: (r: Result) => string }[] = [
    { k: 'A year', f: (r) => pc(r.stats.cagr), c: (r) => changeColor(r.stats.cagr) },
    { k: 'Vs the index', f: (r) => pc(r.stats.cagr - r.stats.benchCagr), c: (r) => changeColor(r.stats.cagr - r.stats.benchCagr) },
    { k: 'Worst fall', f: (r) => pc(r.stats.maxDrop, 0) },
    { k: 'Ups and downs', f: (r) => `${(r.stats.vol * 100).toFixed(0)}%` },
    { k: 'Months ahead', f: (r) => `${Math.round(r.stats.monthsAhead * 100)}%` },
    { k: 'Trades', f: (r) => String(r.trades.length) },
    { k: 'Starts', f: (r) => (lab ? lab.days[r.start].slice(0, 7) : '') },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Compare strategies
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <T v="caption">Pick up to three:</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {choices.map((s) => (
            <Chip key={s.id} label={s.name} on={ids.includes(s.id)} onPress={() => toggle(s.id)} />
          ))}
        </View>
        {!lab ? (
          busy ? (
            <Loading />
          ) : (
            <Empty title="The lab's data isn't here yet" />
          )
        ) : !runs ? (
          <Loading label="Replaying…" />
        ) : !runs.length ? (
          <Empty title="Pick a strategy above" />
        ) : (
          <>
            <Section title="Rs 100 grew to">
              <Panel style={{ paddingVertical: 12 }}>
                <LabChart days={span!.days} log fmt={(v) => v.toFixed(0)} series={[...span!.series, span!.bench]} />
                <T v="caption" style={{ lineHeight: 17, marginTop: 6 }}>
                  From {span!.days[0]}, when all of them have started, without the monthly money, on an even scale. Drag to read any day.
                </T>
              </Panel>
            </Section>
            <Panel style={{ paddingVertical: 4 }}>
              <View style={[styles.row, styles.border]}>
                <View style={{ flex: 1 }} />
                {runs.map((x, k) => (
                  <T key={x.s.id} numberOfLines={2} style={[styles.cell, { fontFamily: fonts.bold, fontSize: 12, color: COLORS[k]() }]}>
                    {x.s.name}
                  </T>
                ))}
              </View>
              {rows.map((row, i) => (
                <View key={row.k} style={[styles.row, i < rows.length - 1 && styles.border]}>
                  <T v="caption" style={{ flex: 1 }}>
                    {row.k}
                  </T>
                  {runs.map((x) => (
                    <T key={x.s.id} v="mono" style={[styles.cell, { color: row.c ? row.c(x.r) : colors.text }]}>
                      {row.f(x.r)}
                    </T>
                  ))}
                </View>
              ))}
            </Panel>
            <T v="caption" style={{ lineHeight: 17 }}>
              Each one over its own start date, after costs and tax. Tap a name above to add or take it off. Information, not advice.
            </T>
            {runs.length > 1 ? <MixSection lab={lab} strategies={mixList} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 6 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    cell: { width: 82, textAlign: 'right', fontSize: 13 },
  }),
);
