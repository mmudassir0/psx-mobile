/** Learn PSX: ten short lessons with examples from your own holdings and a question each. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { makePref } from '../prefs';
import { useHoldings } from '../portfolio/holdings';
import { useMarket } from '../store/market';
import { useReviews } from '../portfolio/useReviews';
import { LESSONS, type LearnProgress, type LessonCtx } from '../learn/lessons';
import { Panel } from '../ui/bits';
import { Button, IconButton, T } from '../ui/kit';

export const learnPref = makePref<LearnProgress>('user.learn', { done: [], right: [] });

export default function LearnScreen() {
  const nav = useNavigation();
  const prog = learnPref.use();
  const { holdings } = useHoldings();
  const { stocks, bySymbol } = useMarket();
  const { rows } = useReviews(holdings, stocks, bySymbol, null);
  const [open, setOpen] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const ctx: LessonCtx = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.value, 0);
    const top = [...rows].sort((a, b) => b.value - a.value)[0];
    const st = top ? (top.stock ?? bySymbol.get(top.holding.symbol)) : undefined;
    return {
      top: top
        ? { symbol: top.holding.symbol, shares: top.holding.shares, price: top.price, avgCost: top.holding.avgCost, pe: st?.pe ?? null, divYield: st?.divYield ?? null, dps: top.dividends?.ttm ?? null, sector: st?.sector ?? null }
        : null,
      holdings: rows.length,
      topWeight: top && total ? top.value / total : null,
    };
  }, [rows, bySymbol]);

  const lesson = open != null ? LESSONS[open] : null;
  const finish = async (correct: boolean) => {
    if (!lesson) return;
    const first = !prog.done.includes(lesson.id);
    await learnPref.set({ done: [...new Set([...prog.done, lesson.id])], right: correct && first ? [...new Set([...prog.right, lesson.id])] : prog.right });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton
          name="back"
          label="Back"
          filled={false}
          onPress={() => {
            if (open != null) {
              setOpen(null);
              setPicked(null);
            } else nav.goBack();
          }}
        />
        <T v="title" style={{ fontSize: 16 }}>
          {lesson ? `Lesson ${open! + 1} of ${LESSONS.length}` : 'Learn PSX'}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!lesson ? (
          <>
            <Panel style={{ paddingVertical: 12, gap: 6 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                {prog.done.length} of {LESSONS.length} done
              </T>
              <View style={styles.track}>
                <View style={{ width: `${(prog.done.length / LESSONS.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.gold }} />
              </View>
              <T v="caption">About 30 minutes in all, a few minutes each. Examples use your own holdings where Sahm has the figures.</T>
            </Panel>
            <Panel style={{ paddingVertical: 4 }}>
              {LESSONS.map((l, i) => {
                const done = prog.done.includes(l.id);
                return (
                  <Pressable key={l.id} accessibilityRole="button" onPress={() => (setOpen(i), setPicked(null))} style={[styles.row, i < LESSONS.length - 1 && styles.border]}>
                    <View style={[styles.num, done && { backgroundColor: colors.up }]}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 13, color: done ? colors.onGold : colors.text2 }}>{done ? '✓' : i + 1}</T>
                    </View>
                    <T style={{ fontFamily: fonts.semibold, fontSize: 14.5, flex: 1 }}>{l.title}</T>
                    <T v="caption">{l.minutes} min</T>
                  </Pressable>
                );
              })}
            </Panel>
          </>
        ) : (
          <>
            <T v="h1" style={{ fontSize: 24 }}>
              {lesson.title}
            </T>
            {lesson.body.map((p, i) => (
              <T key={i} v="body" style={{ fontSize: 15, lineHeight: 23 }}>
                {p}
              </T>
            ))}
            {(() => {
              const ex = lesson.example?.(ctx);
              return ex ? (
                <View style={styles.example}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.gold }}>With your shares</T>
                  <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                    {ex}
                  </T>
                </View>
              ) : null;
            })()}
            {lesson.tryIt ? (
              <Pressable accessibilityRole="link" onPress={() => (nav.navigate as (r: string, p?: object) => void)(lesson.tryIt!.route, lesson.tryIt!.params)}>
                <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Try it in Sahm: {lesson.tryIt.label} ›</T>
              </Pressable>
            ) : null}
            <Panel style={{ paddingVertical: 14, gap: 10 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{lesson.check.q}</T>
              {lesson.check.options.map((o, i) => {
                const show = picked != null;
                const right = i === lesson.check.answer;
                return (
                  <Pressable
                    key={o}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked === i }}
                    disabled={show}
                    onPress={() => {
                      setPicked(i);
                      finish(i === lesson.check.answer);
                    }}
                    style={[styles.opt, show && right && { borderColor: colors.up, backgroundColor: colors.upSoft }, show && picked === i && !right && { borderColor: colors.down, backgroundColor: colors.downSoft }]}
                  >
                    <T style={{ fontSize: 14 }}>{o}</T>
                  </Pressable>
                );
              })}
              {picked != null ? (
                <T v="body" style={{ fontSize: 14, lineHeight: 20, color: picked === lesson.check.answer ? colors.up : colors.text }}>
                  {picked === lesson.check.answer ? 'Right. ' : 'Not quite. '}
                  {lesson.check.why}
                </T>
              ) : null}
            </Panel>
            {picked != null ? (
              open! < LESSONS.length - 1 ? (
                <Button
                  label={`Next: ${LESSONS[open! + 1].title}`}
                  onPress={() => {
                    setOpen(open! + 1);
                    setPicked(null);
                  }}
                />
              ) : (
                <Button
                  label="Done: back to the lessons"
                  onPress={() => {
                    setOpen(null);
                    setPicked(null);
                  }}
                />
              )
            ) : null}
            <T v="caption" style={{ lineHeight: 17 }}>
              General information to help you understand the market, not advice on what to buy. Rules and tax rates change; check the latest with your broker.
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2 },
    example: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4, borderLeftWidth: 3, borderLeftColor: colors.gold },
    opt: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },
  }),
);
