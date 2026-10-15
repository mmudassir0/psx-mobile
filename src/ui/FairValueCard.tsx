/** Fair value range against the price, with each method's working. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtPrice } from '../format';
import { EQUITY_PREMIUM, FairValue, LONG_GROWTH, RATES_AS_OF, RISK_FREE } from '../analysis/fairValue';
import { Panel } from './bits';
import { T } from './kit';

const labelColor = (l: FairValue['label']) => (l === 'Undervalued' ? colors.up : l === 'Overvalued' ? colors.downText : colors.text);
const labelSoft = (l: FairValue['label']) => (l === 'Undervalued' ? colors.upSoft : l === 'Overvalued' ? colors.downSoft : colors.surface2);
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;

/** A scale with the fair range shaded, its midpoint marked and the price as a dot. */
function Scale({ f, price }: { f: FairValue; price: number }) {
  const lo = Math.min(f.low, price) * 0.92;
  const hi = Math.max(f.high, price) * 1.08;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%` as const;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.track}>
        <View style={[styles.band, { left: at(f.low), width: `${((f.high - f.low) / (hi - lo)) * 100}%` }]} />
        <View style={[styles.mid, { left: at(f.mid) }]} />
        <View style={[styles.dot, { left: at(price) }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption">
          <T v="caption" style={{ color: colors.gold }}>
            ■
          </T>{' '}
          Fair range
        </T>
        <T v="caption">● Price</T>
      </View>
    </View>
  );
}

export function FairValueCard({ f, price }: { f: FairValue; price: number }) {
  const [open, setOpen] = useState(false);
  const diff = price / f.mid - 1;
  return (
    <Panel style={{ paddingVertical: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.chip, { backgroundColor: labelSoft(f.label) }]}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 16, color: labelColor(f.label) }}>{f.label ?? 'Rough estimate'}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="mono" style={{ fontSize: 15 }}>
            Rs. {fmtPrice(f.low)} – {fmtPrice(f.high)}
          </T>
          <T v="caption">
            Midpoint Rs. {fmtPrice(f.mid)} · price is {Math.abs(diff * 100).toFixed(0)}% {diff >= 0 ? 'above' : 'below'}
          </T>
        </View>
      </View>
      <Scale f={f} price={price} />

      <View style={{ gap: 10 }}>
        {f.methods.map((m) => (
          <View key={m.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
                {m.name}
              </T>
              <T v="mono" style={{ fontSize: 14.5 }}>
                Rs. {fmtPrice(m.value)}
              </T>
            </View>
            {open ? (
              <T v="caption" style={{ lineHeight: 18 }}>
                {m.how}
              </T>
            ) : null}
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{open ? 'Hide the working' : 'Show the working'}</T>
      </Pressable>

      {f.flags.length ? (
        <View style={styles.flags}>
          {f.flags.map((t) => (
            <T key={t} v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
              • {t}
            </T>
          ))}
        </View>
      ) : null}
      <T v="caption" style={{ lineHeight: 18 }}>
        Required return {pc(RISK_FREE + EQUITY_PREMIUM)}: the 10-year government bond yield ({pc(RISK_FREE)}, {RATES_AS_OF}) plus{' '}
        {pc(EQUITY_PREMIUM)} for equity risk; long-run growth {pc(LONG_GROWTH)}. Undervalued or overvalued means more than 15% from
        the midpoint. An estimate, not a price target.
      </T>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    track: { height: 14, borderRadius: 7, backgroundColor: colors.surface2, justifyContent: 'center' },
    band: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7, backgroundColor: colors.gold, opacity: 0.35 },
    mid: { position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, backgroundColor: colors.gold },
    dot: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.surface },
    flags: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, gap: 6 },
  }),
);
