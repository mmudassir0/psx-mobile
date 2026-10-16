/** One daily pick: buy zone, targets and stop, where the price is now, and a share button. */
import React from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtPrice } from '../format';
import { SETUP_NAMES } from '../analysis/picks';
import { Pick, pickText, ScoredPick } from '../picks/build';
import { Panel } from './bits';
import { T } from './kit';

export const RESULT_LABEL: Record<ScoredPick['result'], string> = {
  open: 'In play',
  'no-fill': 'Not bought: buy zone not reached',
  stop: 'Stopped out',
  'tp1-then-even': 'TP1 hit, rest closed at entry',
  'tp1-then-time': 'TP1 hit, rest closed at the time limit',
  tp2: 'TP2 hit',
  time: 'Closed at the time limit',
};

/** Where the live price sits against today's levels. */
export function liveStatus(p: Pick, price: number | null, bought: boolean): { text: string; tone: string } {
  if (price == null) return { text: '', tone: colors.muted };
  const L = p.levels;
  if (price <= L.stop) return { text: 'Below the stop loss', tone: colors.downText };
  if (price >= L.tp2) return { text: 'Above TP2', tone: colors.up };
  if (price >= L.tp1) return { text: 'Above TP1', tone: colors.up };
  if (bought) return { text: `Bought; ${(((price - L.entryHigh) / L.entryHigh) * 100).toFixed(1)}% from the top of the buy zone`, tone: colors.text2 };
  if (price > L.entryHigh) return { text: `Waiting: ${(((price - L.entryHigh) / L.entryHigh) * 100).toFixed(1)}% above the buy zone`, tone: colors.muted };
  if (price >= L.entryLow) return { text: 'In the buy zone now', tone: colors.gold };
  return { text: 'Below the buy zone, above the stop', tone: colors.text2 };
}

function Row({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <T style={{ width: 22 }}>{icon}</T>
      <T v="body" style={{ flex: 1, fontSize: 14.5, color: colors.text2 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 15, color: tone ?? colors.text }}>
        {value}
      </T>
    </View>
  );
}

export function PickCard({ p, price, bought, onOpen }: { p: Pick; price: number | null; bought?: boolean; onOpen: () => void }) {
  const L = p.levels;
  const s = liveStatus(p, price, !!bought);
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 18 }}>{p.symbol}</T>
          <T v="caption">
            {SETUP_NAMES[p.setup]} · score {p.score.toFixed(1)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="mono" style={{ fontSize: 16 }}>
            {price != null ? fmtPrice(price) : fmtPrice(p.close)}
          </T>
          <T v="caption">{price != null ? 'now' : 'close'}</T>
        </View>
      </Pressable>
      <View style={styles.levels}>
        <Row icon="🟢" label="Buy zone" value={`${fmtPrice(L.entryLow)} – ${fmtPrice(L.entryHigh)}`} />
        <Row icon="🎯" label="TP1" value={fmtPrice(L.tp1)} tone={colors.up} />
        <Row icon="🎯" label="TP2" value={fmtPrice(L.tp2)} tone={colors.up} />
        <Row icon="🛑" label="Stop loss" value={fmtPrice(L.stop)} tone={colors.downText} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <T v="caption" style={{ flex: 1, color: s.tone }}>
          {s.text}
        </T>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => Share.share({ message: pickText(p) }).catch(() => {})}>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Share</T>
        </Pressable>
      </View>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
    levels: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline, paddingVertical: 8 },
  }),
);
