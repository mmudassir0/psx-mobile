/** Sahm's rule-based verdict: call, confidence, levels and the strongest points for and against. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtPrice } from '../format';
import type { Verdict } from '../ai/verdict';
import { Panel } from './bits';
import { T } from './kit';

const callColor = (c: Verdict['call']) => (c === 'Bullish' ? colors.up : c === 'Bearish' ? colors.downText : colors.muted);
const callSoft = (c: Verdict['call']) => (c === 'Bullish' ? colors.upSoft : c === 'Bearish' ? colors.downSoft : colors.surface2);

function Level({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 15, color: tone ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

export function VerdictCard({ v }: { v: Verdict }) {
  const [all, setAll] = useState(false);
  const n = all ? 6 : 3;
  const lv = v.levels;
  return (
    <Panel style={{ paddingVertical: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.call, { backgroundColor: callSoft(v.call) }]}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 18, color: callColor(v.call) }}>{v.call}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
            {v.confidence} confidence
          </T>
          <T v="caption">
            Technical {v.technical?.score.toFixed(1)}/10 · Fundamental {v.fundamental ? `${v.fundamental.score.toFixed(1)}/10` : 'n/a'}
          </T>
        </View>
      </View>
      <T v="body" style={{ color: colors.text2, fontSize: 14.5 }}>
        {v.headline}
      </T>

      {lv?.kind === 'buy' ? (
        <View style={styles.levels}>
          <Level label="Buy zone" value={`${fmtPrice(lv.entryLow)}–${fmtPrice(lv.entryHigh)}`} />
          <Level label="Stop" value={fmtPrice(lv.stop)} tone={colors.downText} />
          <Level label="Target" value={fmtPrice(lv.target)} tone={colors.up} />
        </View>
      ) : lv?.kind === 'avoid' ? (
        <View style={styles.levels}>
          <Level label="New buying" value="Wait" tone={colors.downText} />
          <Level label="Holders' stop" value={fmtPrice(lv.stop)} tone={colors.downText} />
          <Level label="Turns better above" value={fmtPrice(lv.trigger)} />
        </View>
      ) : null}
      {lv?.kind === 'buy' && lv.rr != null ? (
        <T v="caption">
          Reward to risk {lv.rr.toFixed(1)} : 1{lv.rr < 1.5 ? ', thin for a new position' : ''}
        </T>
      ) : null}

      <View style={{ gap: 6 }}>
        {v.bull.slice(0, n).map((p) => (
          <View key={'b' + p.text} style={styles.point}>
            <T style={{ color: colors.up, fontSize: 12, lineHeight: 20, width: 12 }}>▲</T>
            <T v="body" style={styles.pointText}>
              {p.text}
            </T>
          </View>
        ))}
        {v.bear.slice(0, n).map((p) => (
          <View key={'s' + p.text} style={styles.point}>
            <T style={{ color: colors.downText, fontSize: 12, lineHeight: 20, width: 12 }}>▼</T>
            <T v="body" style={styles.pointText}>
              {p.text}
            </T>
          </View>
        ))}
      </View>
      {v.bull.length > 3 || v.bear.length > 3 ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((x) => !x)} hitSlop={8}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{all ? 'Show fewer' : 'Show more reasons'}</T>
        </Pressable>
      ) : null}
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    call: { paddingHorizontal: 14, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    levels: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline, paddingVertical: 12 },
    point: { flexDirection: 'row', gap: 8 },
    pointText: { flex: 1, fontSize: 14, lineHeight: 20 },
  }),
);
