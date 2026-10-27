/** Strategy hunt: hundreds of rule combinations chosen on the earlier years, then checked on the later ones. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { makePref } from '../prefs';
import { rememberHunted, useLab } from '../lab/store';
import { defaultSetup, edge, ideas, summarise, tryIdea, type HuntIdea, type HuntSetup } from '../lab/hunt';
import type { Universe } from '../lab/engine';
import { Panel } from '../ui/bits';
import { Button, Empty, IconButton, Loading, Section, Segmented, T } from '../ui/kit';

interface Saved {
  setup: HuntSetup;
  /** idea id, then a year earlier (strategy, index, worst fall) and later; the rules come back from the id */
  rows: [string, number, number, number, number | null, number | null, number | null][];
}
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const pack = (x: HuntIdea): Saved['rows'][number] => [
  x.strategy.id,
  r4(x.train.cagr),
  r4(x.train.bench),
  r4(x.train.drop),
  x.test ? r4(x.test.cagr) : null,
  x.test ? r4(x.test.bench) : null,
  x.test ? r4(x.test.drop) : null,
];
/** the last hunt for each universe, kept small */
const huntPref = makePref<Record<string, Saved>>('ui.labHunt', {});
const BATCH = 200;
const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;

function Scatter({ all, top }: { all: HuntIdea[]; top: Set<string> }) {
  const [w, setW] = useState(320);
  const H = 220;
  const pts = all.filter((x) => x.test).map((x) => ({ x: edge(x.train), y: edge(x.test!), top: top.has(x.strategy.id) }));
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const lo = (a: number[]) => Math.min(0, ...a),
    hi = (a: number[]) => Math.max(0, ...a);
  const [x0, x1, y0, y1] = [lo(xs), hi(xs), lo(ys), hi(ys)];
  const pad = 26;
  const X = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (w - pad - 8);
  const Y = (v: number) => 8 + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 8 - pad);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.max(220, e.nativeEvent.layout.width))}>
      <Svg width={w} height={H}>
        <Line x1={X(0)} x2={X(0)} y1={8} y2={H - pad} stroke={colors.line} strokeWidth={1} />
        <Line x1={pad} x2={w - 8} y1={Y(0)} y2={Y(0)} stroke={colors.line} strokeWidth={1} />
        {pts
          .filter((p) => !p.top)
          .map((p, k) => (
            <Circle key={k} cx={X(p.x)} cy={Y(p.y)} r={2.4} fill={colors.faint} opacity={0.5} />
          ))}
        {pts
          .filter((p) => p.top)
          .map((p, k) => (
            <Circle key={`t${k}`} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={colors.gold} stroke={colors.surface} strokeWidth={1} />
          ))}
        <SvgText x={w - 8} y={H - 8} fontSize={10} fill={colors.faint} textAnchor="end" fontFamily={fonts.medium}>
          better earlier →
        </SvgText>
        <SvgText x={pad + 4} y={16} fontSize={10} fill={colors.faint} fontFamily={fonts.medium}>
          ↑ better later
        </SvgText>
      </Svg>
    </View>
  );
}

export default function LabHuntScreen() {
  const nav = useNavigation();
  const { lab, busy } = useLab();
  const saved = huntPref.use();
  const [universe, setUniverse] = useState<Universe>('all');
  const setup = useMemo(() => (lab ? defaultSetup(lab, universe) : null), [lab, universe]);
  const list = useMemo(() => (setup ? ideas(setup) : []), [setup]);
  const mine = saved[universe];
  const results = useMemo<HuntIdea[]>(() => {
    if (!mine || !setup || mine.setup.split !== setup.split || mine.setup.from !== setup.from) return [];
    const byId = new Map(list.map((x) => [x.id, x]));
    return mine.rows.filter((r) => byId.has(r[0])).map((r) => ({ strategy: byId.get(r[0])!, train: { cagr: r[1], bench: r[2], drop: r[3] }, test: r[4] != null ? { cagr: r[4], bench: r[5]!, drop: r[6]! } : null }));
  }, [mine, setup, list]);
  const [running, setRunning] = useState<{ done: number; of: number } | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    rememberHunted(results.map((r) => r.strategy));
  }, [results]);

  const go = async () => {
    if (!lab || !setup || running) return;
    stop.current = false;
    const have = new Set(results.map((r) => r.strategy.id));
    const next = list.filter((s) => !have.has(s.id)).slice(0, BATCH);
    const out = [...results];
    setRunning({ done: 0, of: next.length });
    for (let k = 0; k < next.length; k++) {
      if (stop.current) break;
      try {
        out.push(tryIdea(lab, next[k], setup));
      } catch {
        // skip that one
      }
      if (k % 4 === 3) {
        setRunning({ done: k + 1, of: next.length });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await huntPref.set({ ...(await huntPref.get()), [universe]: { setup, rows: out.map(pack) } });
    setRunning(null);
  };

  const sum = useMemo(() => (results.length ? summarise(results) : null), [results]);
  const top = useMemo(() => new Set(sum?.top.map((x) => x.strategy.id) ?? []), [sum]);
  const benchName = universe === 'shariah' ? 'KMI-30' : 'KSE-100';
  const span = setup ? { a: `${setup.from}–${setup.split - 1}`, b: `${setup.split}–${lab!.days[lab!.days.length - 1].slice(0, 4)}` } : { a: '', b: '' };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Strategy hunt
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={{ paddingVertical: 14, gap: 6 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>Do past winners keep winning?</T>
          <T v="caption" style={{ lineHeight: 18 }}>
            Sahm tries {list.length ? list.length.toLocaleString('en-US') : 'hundreds of'} rule combinations, picks the best on {span.a}, then checks every one on {span.b}, years it wasn't chosen on. Rules that only
            looked good by luck usually fall apart there.
          </T>
        </Panel>
        {!lab ? (
          busy ? (
            <Loading label="Downloading the lab's data…" />
          ) : (
            <Empty title="The lab's data isn't here yet" />
          )
        ) : (
          <>
            <Segmented
              options={[
                { key: 'all', label: 'All liquid' },
                { key: 'kse100', label: 'KSE-100' },
                { key: 'shariah', label: 'Shariah' },
              ]}
              value={universe}
              onChange={(u) => !running && setUniverse(u)}
            />
            {running ? (
              <Panel style={{ paddingVertical: 14, gap: 8 }}>
                <T v="body" style={{ fontSize: 14 }}>
                  Trying idea {running.done} of {running.of}…
                </T>
                <View style={styles.track}>
                  <View style={{ width: `${(running.done / Math.max(1, running.of)) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.gold }} />
                </View>
                <Button label="Stop here" tone="ghost" small onPress={() => (stop.current = true)} />
              </Panel>
            ) : results.length < list.length ? (
              <Button label={results.length ? `Try ${Math.min(BATCH, list.length - results.length)} more (${results.length} of ${list.length} tried)` : `Try ${BATCH} ideas`} onPress={go} />
            ) : (
              <T v="caption">All {list.length} combinations tried.</T>
            )}

            {sum ? (
              <>
                <Panel style={{ paddingVertical: 14, gap: 8 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 }}>
                    Of the {sum.top.length} best on {span.a}, {sum.topHeld} also beat the {benchName} on {span.b}.
                  </T>
                  <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                    Later, they did {pc(sum.topLater)} points a year against the index, and the average idea {pc(sum.allLater)}. {sum.allHeld} of {sum.tried} ideas beat it later.{' '}
                    {sum.topLater > sum.allLater + 0.02
                      ? 'So the early winners did carry some of their edge forward, but not all of it.'
                      : 'So being best early said little about later: most of the early edge was luck or that period’s mood.'}
                  </T>
                </Panel>
                <Section title="Every idea, earlier against later">
                  <Panel style={{ paddingVertical: 12, gap: 6 }}>
                    <Scatter all={results} top={top} />
                    <T v="caption" style={{ lineHeight: 17 }}>
                      Each dot is one idea: how far it beat (right) or trailed the index on {span.a}, and up or down for {span.b}. Gold: the {sum.top.length} picked as best. If good early meant good later, the dots would
                      rise to the right.
                    </T>
                  </Panel>
                </Section>
                <Section title={`The best on ${span.a}`}>
                  <Panel style={{ paddingVertical: 4 }}>
                    <View style={[styles.row, styles.border]}>
                      <T v="label" style={{ flex: 1 }}>
                        Idea (vs the index, points a year)
                      </T>
                      <T v="label" style={styles.num}>
                        Earlier
                      </T>
                      <T v="label" style={styles.num}>
                        Later
                      </T>
                    </View>
                    {sum.top.map((x, i) => (
                      <Pressable key={x.strategy.id} accessibilityRole="button" onPress={() => nav.navigate('LabResult', { id: x.strategy.id })} style={[styles.row, i < sum.top.length - 1 && styles.border]}>
                        <T style={{ flex: 1, fontSize: 13, fontFamily: fonts.semibold, lineHeight: 18 }}>{x.strategy.name}</T>
                        <T v="mono" style={[styles.num, { color: changeColor(edge(x.train)) }]}>
                          {pc(edge(x.train))}
                        </T>
                        <T v="mono" style={[styles.num, { color: x.test ? changeColor(edge(x.test)) : colors.faint }]}>
                          {x.test ? pc(edge(x.test)) : '–'}
                        </T>
                      </Pressable>
                    ))}
                  </Panel>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    Chosen by how far they beat the index, with deep falls counting against them. Tap one to see it over the whole period and save it.
                  </T>
                </Section>
                {sum.bestLater ? (
                  <Section title={`The best on ${span.b}`}>
                    <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabResult', { id: sum.bestLater!.strategy.id })} style={styles.best}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{sum.bestLater.strategy.name}</T>
                      <T v="caption" style={{ lineHeight: 17 }}>
                        {pc(edge(sum.bestLater.test!))} points a year against the index on {span.b}, against {pc(edge(sum.bestLater.train))} on {span.a}
                        {top.has(sum.bestLater.strategy.id) ? ', and it was one of the picks.' : `, so it wasn't among the best then: in ${setup!.split - 1} you'd have had no reason to choose it.`}
                      </T>
                    </Pressable>
                  </Section>
                ) : null}
                <T v="caption" style={{ lineHeight: 17 }}>
                  Each idea starts with Rs 100,000, after costs and filer tax, against the index with its dividends. More ideas tried means more chances of a lucky one, which is exactly why the later years matter.
                  Information, not advice.
                </T>
              </>
            ) : null}
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    num: { width: 56, textAlign: 'right', fontSize: 13 },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2 },
    best: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.line },
  }),
);
