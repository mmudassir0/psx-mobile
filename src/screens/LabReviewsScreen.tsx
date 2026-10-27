/** Would Sahm's warnings have helped? Its price and dividend warnings over ten years, and what the stocks did next. */
import React, { useEffect, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { useLab } from '../lab/store';
import { GROUP_LABEL, HORIZONS, reviewTest, type Group, type ReviewTest } from '../lab/reviewTest';
import type { Universe } from '../lab/engine';
import { Panel } from '../ui/bits';
import { Empty, IconButton, Loading, Section, Segmented, T } from '../ui/kit';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
const ORDER: Group[] = ['chart', 'clear', 'uptrend', 'cut'];

function verdict(g: Group, edge6: number): string {
  const size = Math.abs(edge6) < 0.005 ? 'about the same as' : edge6 < 0 ? `${(Math.abs(edge6) * 100).toFixed(1)} points worse than` : `${(edge6 * 100).toFixed(1)} points better than`;
  const base = `Over the next six months these did ${size} the average stock.`;
  if (g === 'chart') return edge6 < -0.005 ? `${base} The warning pointed the right way.` : `${base} On its own, the warning wasn't much use.`;
  if (g === 'cut') return edge6 < -0.005 ? `${base} A cut was a real warning sign.` : `${base} By the time a cut showed up, the price had usually fallen already.`;
  if (g === 'uptrend') return base;
  return base;
}

export default function LabReviewsScreen() {
  const nav = useNavigation();
  const { lab, busy } = useLab();
  const [universe, setUniverse] = useState<Universe>('kse100');
  const [res, setRes] = useState<ReviewTest | null>(null);
  useEffect(() => {
    if (!lab) return;
    setRes(null);
    const t = InteractionManager.runAfterInteractions(() => setRes(reviewTest(lab, universe)));
    return () => t.cancel();
  }, [lab, universe]);
  const benchName = universe === 'shariah' ? 'KMI-30' : 'KSE-100';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Sahm's warnings, tested
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <T v="body" style={{ fontSize: 14, color: colors.text2, lineHeight: 20 }}>
          Every month since the lab's data starts, each stock is put in a group by the warnings Sahm's holding review gives from prices and dividends. Then: what did it do over the next months, against the average stock
          that month?
        </T>
        <Segmented
          options={[
            { key: 'kse100', label: 'KSE-100' },
            { key: 'all', label: 'All liquid' },
            { key: 'shariah', label: 'Shariah' },
          ]}
          value={universe}
          onChange={setUniverse}
        />
        {!lab ? (
          busy ? (
            <Loading />
          ) : (
            <Empty title="The lab's data isn't here yet" />
          )
        ) : !res ? (
          <Loading label="Going through ten years…" />
        ) : (
          <>
            <Panel style={{ paddingVertical: 14, gap: 8 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 }}>Acting on the 200-day warning</T>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption">Hold them all</T>
                  <T style={{ fontFamily: fonts.heavy, fontSize: 20, color: changeColor(res.hold.cagr) }}>{pc(res.hold.cagr)}</T>
                  <T v="caption">worst fall {pc(res.hold.drop, 0)}</T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption">Only those above it</T>
                  <T style={{ fontFamily: fonts.heavy, fontSize: 20, color: changeColor(res.act.cagr) }}>{pc(res.act.cagr)}</T>
                  <T v="caption">worst fall {pc(res.act.drop, 0)}</T>
                </View>
              </View>
              <T v="caption" style={{ lineHeight: 17 }}>
                A year from {res.from.slice(0, 4)}, all {universe === 'all' ? 'liquid' : benchName} stocks in equal amounts, against the same but selling any that drop under their 200-day average and buying back once
                they're above it ({benchName} with dividends: {pc(res.bench)}). {res.act.drop > res.hold.drop + 0.05 ? 'The warning mostly helped by keeping you out of the deepest falls.' : ''}
              </T>
            </Panel>

            {ORDER.map((g) => {
              const s = res.groups[g];
              if (!s.n) return null;
              return (
                <Section key={g} title={GROUP_LABEL[g]}>
                  <Panel style={{ paddingVertical: 6 }}>
                    <View style={[styles.row, styles.border]}>
                      <T v="label" style={{ flex: 1 }}>
                        Next
                      </T>
                      {HORIZONS.map((h) => (
                        <T key={h} v="label" style={styles.num}>
                          {h === 12 ? '1 year' : `${h} mo`}
                        </T>
                      ))}
                    </View>
                    <View style={[styles.row, styles.border]}>
                      <T v="caption" style={{ flex: 1 }}>
                        Vs the average stock
                      </T>
                      {s.edge.map((e, k) => (
                        <T key={k} v="mono" style={[styles.num, { color: changeColor(e) }]}>
                          {pc(e)}
                        </T>
                      ))}
                    </View>
                    <View style={styles.row}>
                      <T v="caption" style={{ flex: 1 }}>
                        Beat the middle stock
                      </T>
                      {s.beat.map((b, k) => (
                        <T key={k} v="mono" style={styles.num}>
                          {Math.round(b * 100)}%
                        </T>
                      ))}
                    </View>
                  </Panel>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    {s.n.toLocaleString('en-US')} times a stock was in this group. {verdict(g, s.edge[2])}
                  </T>
                </Section>
              );
            })}
            <T v="caption" style={{ lineHeight: 17 }}>
              Returns include dividends. Warnings from earnings (a loss, falling profits) and from fair value aren't here, because Sahm has only a few years of results. Today's index lists are used throughout and
              delisted stocks aren't in the data. Information, not advice.
            </T>
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
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 4 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    num: { width: 58, textAlign: 'right', fontSize: 12.5 },
  }),
);
