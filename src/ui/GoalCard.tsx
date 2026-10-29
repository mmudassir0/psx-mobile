/** Your goals (a house, Hajj, education…): each with a target, a date, its share of the portfolio and its own monthly amount. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtNum } from '../format';
import { load } from '../storage';
import { goalPref, goalsFrom, goalsPref, goalsStatus, type NamedGoal } from '../portfolio/goal';
import { monthName } from '../portfolio/monthly';
import { Panel } from './bits';
import { Button, T } from './kit';

const RATES = [0.1, 0.15, 0.2];
const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;
const IDEAS = ['House', 'Hajj', "Children's education", 'Car', 'Retirement', 'Wedding'];

function GoalForm({
  initial,
  tracked,
  otherShares,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: NamedGoal | null;
  tracked: number | null;
  otherShares: number;
  onSave: (g: NamedGoal) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const y = new Date().getUTCFullYear();
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [year, setYear] = useState(initial ? initial.by.slice(0, 4) : String(y + 5));
  const [rate, setRate] = useState(initial?.rate ?? 0.15);
  const free = Math.max(0, Math.round((1 - otherShares) * 100));
  const [share, setShare] = useState(initial ? String(Math.round(initial.share * 100)) : String(free));
  const [monthly, setMonthly] = useState(initial?.monthly ? String(initial.monthly) : '');
  const ok = name.trim() && num(target) > 0 && Number(year) > y - 1 && Number(year) < y + 60;
  const rates = tracked != null && tracked > 0 && tracked < 1 ? [...RATES, Math.round(tracked * 100) / 100] : RATES;
  return (
    <View style={{ gap: 10 }}>
      <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. House" placeholderTextColor={colors.faint} style={[styles.input, { width: '100%', textAlign: 'left' }]} accessibilityLabel="Goal name" />
      {!initial && !name ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {IDEAS.map((n) => (
            <Pressable key={n} onPress={() => setName(n)} style={styles.chip}>
              <T style={{ fontSize: 12.5, fontFamily: fonts.semibold, color: colors.text2 }}>{n}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="Target (Rs)" value={target} onChange={setTarget} placeholder="2,000,000" />
      <Field label="By the end of" value={year} onChange={setYear} placeholder={String(y + 5)} max={4} />
      <Field label="Share of today's portfolio (%)" value={share} onChange={setShare} placeholder={String(free)} />
      <Field label="Monthly amount for it (Rs)" value={monthly} onChange={setMonthly} placeholder="optional" />
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
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onCancel ? (
          <View style={{ flex: 1 }}>
            <Button label="Cancel" tone="ghost" onPress={onCancel} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label="Save goal"
            disabled={!ok}
            onPress={() =>
              onSave({
                id: initial?.id ?? `g${Date.now()}`,
                name: name.trim(),
                target: num(target),
                by: `${year}-12`,
                rate,
                share: Math.min(1, num(share) / 100),
                monthly: num(monthly),
              })
            }
          />
        </View>
      </View>
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={6}>
          <T v="caption" style={{ color: colors.downText }}>
            Delete this goal
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, max }: { label: string; value: string; onChange: (s: string) => void; placeholder: string; max?: number }) {
  return (
    <View style={styles.formRow}>
      <T v="body" style={{ flex: 1, fontSize: 14 }}>
        {label}
      </T>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder={placeholder} placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel={label} maxLength={max} />
    </View>
  );
}

export function GoalCard({ value, tracked }: { value: number; tracked: number | null }) {
  const saved = goalsPref.use();
  const old = goalPref.use();
  const [oldMonthly, setOldMonthly] = useState<number | null>(null);
  useEffect(() => {
    load<string>('plan.amount', '').then((v) => setOldMonthly(num(v) || null));
  }, []);
  const goals = goalsFrom(saved, old, oldMonthly);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const save = (list: NamedGoal[]) => goalsPref.set(list);
  const statuses = goalsStatus(goals, value);
  const totalShare = goals.reduce((a, g) => a + g.share, 0);
  const totalNeed = statuses.reduce((a, s) => a + (s.status.months > 0 ? s.status.need : 0), 0);

  if (!goals.length || editing === 'new')
    return (
      <Panel style={{ paddingVertical: 14, gap: 10 }}>
        {!goals.length ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            Set a goal, such as a house in 2032 or Hajj in 2028, to see the monthly amount it needs and whether you're on course. You can add several.
          </T>
        ) : null}
        <GoalForm initial={null} tracked={tracked} otherShares={totalShare} onSave={(g) => (save([...goals, g]), setEditing(null))} onCancel={goals.length ? () => setEditing(null) : undefined} />
      </Panel>
    );

  return (
    <View style={{ gap: 10 }}>
      {statuses.map(({ goal: g, value: v, status: s, progress }) =>
        editing === g.id ? (
          <Panel key={g.id} style={{ paddingVertical: 14 }}>
            <GoalForm
              initial={g}
              tracked={tracked}
              otherShares={totalShare - g.share}
              onSave={(n) => (save(goals.map((x) => (x.id === g.id ? n : x))), setEditing(null))}
              onCancel={() => setEditing(null)}
              onDelete={() => (save(goals.filter((x) => x.id !== g.id)), setEditing(null))}
            />
          </Panel>
        ) : (
          <Pressable key={g.id} accessibilityRole="button" onPress={() => setOpen(open === g.id ? null : g.id)}>
            <Panel style={{ paddingVertical: 12, gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 15, flex: 1 }} numberOfLines={1}>
                  {g.name}
                </T>
                <T v="caption">
                  Rs {fmtNum(g.target, 0)} by {monthName(g.by)}
                </T>
              </View>
              <View style={styles.track}>
                <View style={{ width: `${progress * 100}%`, height: 8, borderRadius: 4, backgroundColor: s.onTrack === false ? colors.downText : colors.gold }} />
              </View>
              <T v="caption">
                Rs {fmtNum(v, 0)} set aside ({Math.round(g.share * 100)}%) · {(progress * 100).toFixed(0)}% · {s.months} months left
              </T>
              {open === g.id ? (
                <View style={{ gap: 6 }}>
                  <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                    {s.months <= 0
                      ? `The date has arrived: ${v >= g.target ? 'reached.' : `Rs ${fmtNum(g.target - v, 0)} short.`}`
                      : s.need > 0
                        ? `At ${Math.round(g.rate * 100)}% a year it needs about Rs ${fmtNum(s.need, 0)} a month.`
                        : `At ${Math.round(g.rate * 100)}% a year, what's set aside gets there without adding more.`}
                    {s.months > 0 && s.reach != null
                      ? ` Your Rs ${fmtNum(g.monthly, 0)} a month would reach about Rs ${fmtNum(s.reach, 0)}: ${s.onTrack ? 'on course.' : `short by about Rs ${fmtNum(g.target - s.reach, 0)}.`}`
                      : ''}
                  </T>
                  <T v="caption" style={{ lineHeight: 17 }}>
                    In today's money that's about Rs {fmtNum(s.realTarget, 0)} if prices rise 8% a year.
                  </T>
                  <T style={{ fontFamily: fonts.semibold, color: colors.gold, fontSize: 13.5 }} onPress={() => setEditing(g.id)}>
                    Change this goal ›
                  </T>
                </View>
              ) : (
                <T v="caption" style={{ color: s.onTrack === false ? colors.downText : s.onTrack ? colors.up : colors.faint }}>
                  {s.months <= 0 ? 'Date reached' : s.onTrack == null ? `Needs about Rs ${fmtNum(s.need, 0)} a month` : s.onTrack ? 'On course' : 'Behind: tap for details'}
                </T>
              )}
            </Panel>
          </Pressable>
        ),
      )}
      {totalShare > 1.001 ? (
        <T v="caption" style={{ color: colors.gold }}>
          The shares add up to {Math.round(totalShare * 100)}%, so each is scaled down to fit your portfolio.
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="caption" style={{ flex: 1 }}>
          {goals.length > 1 ? `All goals together need about Rs ${fmtNum(totalNeed, 0)} a month.` : ''}
        </T>
        <Button label="Add a goal" small tone="ghost" onPress={() => setEditing('new')} />
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        Returns won't be steady: some years fall, so treat these as a guide, not a promise.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    formRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: {
      width: 140,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.ground,
      paddingHorizontal: 10,
      fontFamily: fonts.mono,
      fontSize: 15,
      color: colors.text,
      textAlign: 'right',
    },
    chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface2, justifyContent: 'center' },
    chipOn: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  }),
);
