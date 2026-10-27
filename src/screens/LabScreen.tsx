/** Backtesting lab: test an investing rule on ten years of PSX prices before using real money. */
import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { findStrategy, holdingsStrategy, labFollowPref, labStrategiesPref, setDraft, useLab } from '../lab/store';
import { readCode } from '../lab/share';
import { useHoldings } from '../portfolio/holdings';
import { runBacktest, type Strategy } from '../lab/engine';
import { TEMPLATES } from '../lab/templates';
import { describe } from '../lab/describe';
import { Panel } from '../ui/bits';
import { Button, Empty, IconButton, Loading, Section, T } from '../ui/kit';

const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

function Row({ s, note, quick, onPress, last }: { s: Strategy; note: string; quick?: { cagr: number; bench: number } | null; onPress: () => void; last: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, gap: 3 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{s.name}</T>
        <T v="caption" style={{ lineHeight: 17 }} numberOfLines={2}>
          {note}
        </T>
      </View>
      {quick ? (
        <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 74 }}>
          <T v="mono" style={{ fontFamily: fonts.bold, fontSize: 14, color: changeColor(quick.cagr) }}>
            {pc(quick.cagr)}
          </T>
          <T v="caption" style={{ fontSize: 11 }}>
            a year · index {pc(quick.bench)}
          </T>
        </View>
      ) : (
        <T v="caption">›</T>
      )}
    </Pressable>
  );
}

export default function LabScreen() {
  const nav = useNavigation();
  const { lab, busy, error, built, reload } = useLab();
  const mine = labStrategiesPref.use();
  const follow = labFollowPref.use();
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const openCode = () => {
    const s = readCode(code, 'draft');
    if (!s) return setCodeMsg("That doesn't look like a Sahm strategy code (it starts with SAHM1-).");
    setCodeMsg(null);
    setCode('');
    setDraft(s);
    nav.navigate('LabResult', { id: 'draft' });
  };
  const followed = follow ? findStrategy(follow.id, mine) : null;
  const [quick, setQuick] = useState<Record<string, { cagr: number; bench: number }>>({});
  const { holdings } = useHoldings();
  const mineHold = useMemo(() => holdingsStrategy(holdings.map((h) => h.symbol)), [holdings]);
  const all = useMemo(() => [...TEMPLATES.map((t) => t.strategy), ...mine, ...(mineHold ? [mineHold] : [])], [mine, mineHold]);
  useEffect(() => {
    if (!lab) return;
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      const out: Record<string, { cagr: number; bench: number }> = {};
      for (const s of all) {
        if (!alive) return;
        try {
          const r = runBacktest(lab, s);
          out[s.id] = { cagr: r.stats.cagr, bench: r.stats.benchCagr };
        } catch {
          // shown without a figure
        }
      }
      if (alive) setQuick(out);
    });
    return () => {
      alive = false;
      task.cancel();
    };
  }, [lab, all]);

  const open = (s: Strategy) => nav.navigate('LabResult', { id: s.id });
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          Backtesting lab
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={{ paddingVertical: 14, gap: 6 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>Try a rule on the past before real money</T>
          <T v="caption" style={{ lineHeight: 18 }}>
            Pick which stocks to buy and when to sell. Sahm replays it day by day from as early as 2018, with costs, tax and dividends, and shows how it compares with the index.
          </T>
          {lab ? (
            <T v="caption" style={{ lineHeight: 18 }}>
              {lab.stocks.length} stocks · {lab.days[0].slice(0, 4)}–{lab.days[lab.days.length - 1].slice(0, 4)} · updated {built ? fmtDay(Date.parse(built + 'T12:00:00Z')) : ''}
              {busy ? ' · checking for newer data…' : ''}
            </T>
          ) : null}
        </Panel>
        {!lab ? (
          busy ? (
            <Loading label="Downloading ten years of prices (about 1 MB, once)…" />
          ) : (
            <View style={{ gap: 12 }}>
              <Empty title="The lab's data isn't here yet" body={error ?? 'It downloads once, about 1 MB.'} />
              <Button label="Try again" onPress={reload} />
            </View>
          )
        ) : (
          <>
            {followed ? (
              <Section title="You follow">
                <Panel style={{ paddingVertical: 4 }}>
                  <Row s={followed} note={`Since ${follow!.since}. ${describe(followed)}`} quick={quick[followed.id]} onPress={() => open(followed)} last />
                </Panel>
              </Section>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="+ New strategy" style={{ flex: 1 }} onPress={() => nav.navigate('LabEdit', {})} />
              <Button label="Strategy hunt" tone="ghost" style={{ flex: 1 }} onPress={() => nav.navigate('LabHunt')} />
            </View>
            {mine.length ? (
              <Section title="Your strategies" action={mine.length > 1 ? 'Compare' : undefined} onAction={() => nav.navigate('LabCompare', { ids: mine.slice(0, 3).map((s) => s.id) })}>
                <Panel style={{ paddingVertical: 4 }}>
                  {mine.map((s, i) => (
                    <Row key={s.id} s={s} note={describe(s)} quick={quick[s.id]} onPress={() => open(s)} last={i === mine.length - 1} />
                  ))}
                </Panel>
              </Section>
            ) : null}
            {mineHold ? (
              <Section title="Your own holdings, tested">
                <Panel style={{ paddingVertical: 4 }}>
                  <Row s={mineHold} note="What your current stocks would have done if you'd bought them in equal amounts at the start." quick={quick[mineHold.id]} onPress={() => open(mineHold)} last />
                </Panel>
              </Section>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabReviews')} style={styles.link}>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Would Sahm's warnings have helped?</T>
                <T v="caption" style={{ lineHeight: 17 }}>
                  Ten years of its chart and dividend warnings, and what the stocks did next.
                </T>
              </View>
              <T v="caption">›</T>
            </Pressable>
            <Section title="Open a code someone sent you">
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={code} onChangeText={setCode} placeholder="SAHM1-…" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} style={styles.code} accessibilityLabel="Strategy code" />
                <Button label="Open" small onPress={openCode} disabled={!code.trim()} />
              </View>
              {codeMsg ? (
                <T v="caption" style={{ color: colors.downText }}>
                  {codeMsg}
                </T>
              ) : null}
            </Section>
            <Section title="Ready-made ideas to start from">
              <Panel style={{ paddingVertical: 4 }}>
                {TEMPLATES.map((t, i) => (
                  <Row key={t.key} s={t.strategy} note={t.about} quick={quick[t.strategy.id]} onPress={() => open(t.strategy)} last={i === TEMPLATES.length - 1} />
                ))}
              </Panel>
            </Section>
            <T v="caption" style={{ lineHeight: 17 }}>
              Figures are a year on average, after costs and tax as a filer, against the index with its dividends, with Rs 100,000 to start and Rs 10,000 a month. Tap one to see it in full and change it. The past doesn't
              promise the future: a rule that worked here can stop working. Information, not advice.
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    code: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.medium, fontSize: 14 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line },
  }),
);
