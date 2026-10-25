/** Your goal: a target value by a date, the monthly amount it needs, and whether this month's plan is on course. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtNum } from '../format';
import { load } from '../storage';
import { goalPref, goalStatus, type Goal } from '../portfolio/goal';
import { monthName } from '../portfolio/monthly';
import { Panel } from './bits';
import { Button, T } from './kit';

const RATES = [0.1, 0.15, 0.2];
const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;

function GoalForm({ initial, tracked, onDone }: { initial: Goal | null; tracked: number | null; onDone: () => void }) {
  const y = new Date().getUTCFullYear();
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [year, setYear] = useState(initial ? initial.by.slice(0, 4) : String(y + 5));
  const [rate, setRate] = useState(initial?.rate ?? 0.15);
  const ok = num(target) > 0 && Number(year) > y - 1 && Number(year) < y + 60;
  const rates = tracked != null && tracked > 0 && tracked < 1 ? [...RATES, Math.round(tracked * 100) / 100] : RATES;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.formRow}>
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          Target (Rs)
        </T>
        <TextInput value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="2,000,000" placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Target amount in rupees" />
      </View>
      <View style={styles.formRow}>
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          By the end of
        </T>
        <TextInput value={year} onChangeText={setYear} keyboardType="numeric" placeholder={String(y + 5)} placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Target year" maxLength={4} />
      </View>
      <T v="caption">Yearly return to assume</T>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {rates.map((r, i) => (
          <Pressable key={r} accessibilityRole="button" accessibilityState={{ selected: r === rate }} onPress={() => setRate(r)} style={[styles.chip, r === rate && styles.chipOn]}>
            <T style={{ fontFamily: fonts.bold, fontSize: 13, color: r === rate ? colors.text : colors.faint }}>
              {Math.round(r * 100)}%{i === RATES.length ? ' (yours so far)' : ''}
            </T>
          </Pressable>
        ))}
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        For scale: the KSE-100 went from 1,000 in 1991 to about 166,000 now, roughly 15–16% a year, with years far above and below
        that. A lower figure is the safer plan.
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {initial ? (
          <View style={{ flex: 1 }}>
            <Button label="Cancel" tone="ghost" onPress={onDone} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label="Save goal"
            disabled={!ok}
            onPress={async () => {
              await goalPref.set({ target: num(target), by: `${year}-12`, rate });
              onDone();
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function GoalCard({ value, tracked }: { value: number; tracked: number | null }) {
  const goal = goalPref.use();
  const [editing, setEditing] = useState(false);
  const [perMonth, setPerMonth] = useState<number | null>(null);
  useEffect(() => {
    load<string>('plan.amount', '').then((v) => setPerMonth(num(v) || null));
  }, [editing]);
  if (!goal || editing)
    return (
      <Panel style={{ paddingVertical: 14, gap: 10 }}>
        {!goal ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            Set a target, such as Rs 2 million by 2031, to see the monthly amount it needs and whether you're on course.
          </T>
        ) : null}
        <GoalForm initial={goal} tracked={tracked} onDone={() => setEditing(false)} />
      </Panel>
    );
  const s = goalStatus(goal, value, perMonth);
  const progress = Math.min(1, value / goal.target);
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          Rs {fmtNum(goal.target, 0)} by {monthName(goal.by)}
        </T>
        <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }} onPress={() => setEditing(true)}>
          Change
        </T>
      </View>
      <View style={styles.track}>
        <View style={{ width: `${progress * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />
      </View>
      <T v="caption">
        Rs {fmtNum(value, 0)} now · {(progress * 100).toFixed(0)}% of the way · {s.months} months left
      </T>
      {s.months > 0 ? (
        <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
          {s.need > 0 ? (
            <>
              At {Math.round(goal.rate * 100)}% a year it needs about <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Rs {fmtNum(s.need, 0)} a month</T>.
            </>
          ) : (
            `At ${Math.round(goal.rate * 100)}% a year, what you have already gets there without adding more.`
          )}
          {s.reach != null && perMonth
            ? ` Your Rs ${fmtNum(perMonth, 0)} a month (from Invest cash) would reach about Rs ${fmtNum(s.reach, 0)}: ${s.onTrack ? 'on course.' : `short by about Rs ${fmtNum(goal.target - s.reach, 0)}.`}`
            : ' Enter a monthly amount under Invest cash to check your plan against it.'}
        </T>
      ) : (
        <T v="body" style={{ fontSize: 14, color: colors.text2 }}>
          The target date has arrived: {value >= goal.target ? 'reached.' : `Rs ${fmtNum(goal.target - value, 0)} short.`}
        </T>
      )}
      <T v="caption" style={{ lineHeight: 18 }}>
        In today's money, Rs {fmtNum(goal.target, 0)} then is worth about Rs {fmtNum(s.realTarget, 0)} if prices rise 8% a year. Returns
        won't be steady: some years fall, so treat this as a guide, not a promise.
      </T>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    formRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: { width: 140, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingHorizontal: 10, fontFamily: fonts.mono, fontSize: 15, color: colors.text, textAlign: 'right' },
    chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface2, justifyContent: 'center' },
    chipOn: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  }),
);
