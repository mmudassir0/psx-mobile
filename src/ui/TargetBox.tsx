/** A holding's target and rethink prices: a bar showing where the price sits between them, set or changed in place. */
import React, { useState } from 'react';
import { tt, useLang } from '../i18n';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtPrice } from '../format';
import { position, stateOf, targetsPref, withTargetRules, type PriceTargets } from '../portfolio/targets';
import { watchRulesPref } from '../portfolio/prefs';
import { Button, T } from './kit';

const num = (s: string) => {
  const v = Number(s.replace(/[^\d.]/g, ''));
  return v > 0 ? v : null;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

export function TargetBox({ symbol, price, avgCost, fairMid }: { symbol: string; price: number; avgCost: number; fairMid: number | null }) {
  const all = targetsPref.use();
  const t = all[symbol];
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState('');
  const [rethink, setRethink] = useState('');
  const [saved, setSaved] = useState(false);
  const start = () => {
    setTarget(t?.target != null ? String(t.target) : '');
    setRethink(t?.rethink != null ? String(t.rethink) : '');
    setEdit(true);
  };
  const save = async (next: PriceTargets) => {
    const cur = await targetsPref.get();
    const rules = await watchRulesPref.get();
    await watchRulesPref.set(withTargetRules(rules, symbol, cur[symbol], next));
    const { [symbol]: _old, ...rest } = cur;
    await targetsPref.set(next.target == null && next.rethink == null ? rest : { ...rest, [symbol]: next });
    setEdit(false);
    setSaved(true);
  };

  if (edit)
    return (
      <View style={styles.box}>
        <Row label="Target price" value={target} onChange={setTarget} />
        <View style={styles.sugg}>
          {fairMid ? <Sugg label={`Fair value ${fmtPrice(fairMid)}`} onPress={() => setTarget(String(r2(fairMid)))} /> : null}
          <Sugg label="+25% on cost" onPress={() => setTarget(String(r2(avgCost * 1.25)))} />
          <Sugg label="+50% on cost" onPress={() => setTarget(String(r2(avgCost * 1.5)))} />
        </View>
        <Row label="Rethink below" value={rethink} onChange={setRethink} />
        <View style={styles.sugg}>
          <Sugg label="−15% on cost" onPress={() => setRethink(String(r2(avgCost * 0.85)))} />
          <Sugg label="−20% from now" onPress={() => setRethink(String(r2(price * 0.8)))} />
        </View>
        <T v="caption" style={{ lineHeight: 17 }}>
          The target is where you'd take some profit or at least look again; below the rethink price, ask whether your reason for owning it
          still holds. Both become evening price alerts.
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" small tone="ghost" onPress={() => setEdit(false)} />
          </View>
          {t ? (
            <View style={{ flex: 1 }}>
              <Button label="Clear" small tone="ghost" onPress={() => save({ target: null, rethink: null })} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Save" small disabled={!num(target) && !num(rethink)} onPress={() => save({ target: num(target), rethink: num(rethink) })} />
          </View>
        </View>
      </View>
    );

  if (!t)
    return (
      <Pressable onPress={start} hitSlop={4}>
        <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
          {tt("Set a target and a rethink price ›")}
        </T>
      </Pressable>
    );

  const pos = position(price, t);
  const st = stateOf(price, t);
  const toTarget = t.target != null ? t.target / price - 1 : null;
  const aboveRethink = t.rethink != null ? price / t.rethink - 1 : null;
  return (
    <Pressable onPress={start} style={{ gap: 5 }}>
      {pos != null ? (
        <View style={{ height: 14, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ flex: 1, backgroundColor: colors.downSoft }} />
            <View style={{ flex: 1, backgroundColor: colors.surface2 }} />
            <View style={{ flex: 1, backgroundColor: colors.upSoft }} />
          </View>
          <View style={[styles.marker, { left: `${Math.max(0, Math.min(1, pos)) * 100}%`, backgroundColor: st === 'reached' ? colors.up : st === 'broken' ? colors.down : colors.text }]} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption" style={{ color: st === 'broken' ? colors.downText : colors.faint }}>{t.rethink != null ? `Rethink ${fmtPrice(t.rethink)}` : 'No rethink price'}</T>
        <T v="caption" style={{ color: st === 'reached' ? colors.up : colors.faint }}>{t.target != null ? `Target ${fmtPrice(t.target)}` : 'No target'}</T>
      </View>
      <T v="caption" style={{ color: st === 'reached' ? colors.up : st === 'broken' ? colors.downText : colors.text2 }}>
        {st === 'reached'
          ? 'Target reached: time to take some profit, or raise the target if the reason still holds.'
          : st === 'broken'
            ? 'Below your rethink price: check whether your reason for owning it still holds.'
            : [toTarget != null ? `${(toTarget * 100).toFixed(1)}% to target` : null, aboveRethink != null ? `${(aboveRethink * 100).toFixed(1)}% above rethink` : null].filter(Boolean).join(' · ')}
      </T>
      {saved ? <T v="caption" style={{ color: colors.gold }}>Added to Price alerts: copy the list into the WATCH_ALERTS secret to get them in the evening.</T> : null}
    </Pressable>
  );
}

function Row({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <T v="body" style={{ flex: 1, fontSize: 14 }}>
        {label}
      </T>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="Rs" placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel={label} />
    </View>
  );
}

function Sugg({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <T style={{ fontSize: 12, fontFamily: fonts.semibold, color: colors.text2 }}>{label}</T>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.surface2 },
    input: { width: 110, height: 38, borderRadius: 9, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, fontSize: 14.5, color: colors.text, fontFamily: fonts.monoMedium, textAlign: 'right' },
    sugg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: colors.ground },
    marker: { position: 'absolute', width: 4, height: 14, marginLeft: -2, borderRadius: 2 },
  }),
);
