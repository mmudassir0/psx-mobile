/** Backtesting lab: test an investing rule on ten years of PSX prices before using real money. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { findStrategy, holdingsStrategy, labAskedPref, labFollowPref, labStrategiesPref, rememberHunted, setDraft, useLab } from '../lab/store';
import { readCode } from '../lab/share';
import { useHoldings } from '../portfolio/holdings';
import type { Strategy } from '../lab/engine';
import { runCached, strategyKey } from '../lab/cache';
import { makePref } from '../prefs';

/** the figures shown on this list, saved so the lab opens with them (cleared when new data comes) */
const labQuickPref = makePref<{ built: string; rows: Record<string, number[]> }>('ui.labQuick', { built: '', rows: {} });
import { TEMPLATES } from '../lab/templates';
import { describe } from '../lab/describe';
import { Panel } from '../ui/bits';
import { Button, Empty, IconButton, Loading, Section, T, ScreenHeader } from '../ui/kit';
import { Press, Rise } from '../ui/motion';
import { YearBars } from '../ui/YearBars';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;

type Quick = { cagr: number; bench: number; drop: number };

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption" style={{ fontSize: 11 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 17, color }}>
        {value}
      </T>
    </View>
  );
}

/** One strategy as a table row: name and what it does, a year on average, its worst fall. */
function Row({ s, note, quick, onPress, last }: { s: Strategy; note: string; quick?: Quick | null; onPress: () => void; last: boolean }) {
  return (
    <Press accessibilityRole="button" onPress={onPress} scaleTo={0.985} style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14.5 }} numberOfLines={1}>
          {s.name}
        </T>
        <T v="caption" style={{ fontSize: 11.5 }} numberOfLines={1}>
          {note}
        </T>
      </View>
      {quick ? (
        <>
          <T v="mono" style={[styles.num, { color: quick.cagr >= quick.bench ? colors.up : colors.text2 }]}>
            {pc(quick.cagr)}
          </T>
          <T v="mono" style={[styles.num, { color: colors.downText }]}>
            {pc(quick.drop, 0)}
          </T>
        </>
      ) : (
        <T v="caption" style={{ width: 132, textAlign: 'right' }}>
          …
        </T>
      )}
    </Press>
  );
}

/** The column heads; tapping one sorts by it. */
function Head({ title, sort, onSort }: { title: string; sort: 'cagr' | 'drop'; onSort: (k: 'cagr' | 'drop') => void }) {
  const col = (k: 'cagr' | 'drop', label: string) => (
    <Press accessibilityRole="button" accessibilityState={{ selected: sort === k }} accessibilityLabel={`Sort by ${label}`} onPress={() => onSort(k)} style={{ width: 58, alignItems: 'flex-end' }}>
      <T style={[styles.head, sort === k && { color: colors.text, textDecorationLine: 'underline' }]}>{label}</T>
    </Press>
  );
  return (
    <View style={[styles.row, styles.border, { paddingVertical: 10 }]}>
      <T style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 14 }}>{title}</T>
      {col('cagr', 'A year')}
      {col('drop', 'Worst fall')}
    </View>
  );
}

export default function LabScreen() {
  const nav = useNavigation();
  const { lab, busy, error, built, reload } = useLab();
  const mine = labStrategiesPref.use();
  const follow = labFollowPref.use();
  const asked = labAskedPref.use();
  useEffect(() => rememberHunted(asked.map((a) => a.strategy)), [asked]);
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
  const [quick, setQuick] = useState<Record<string, Quick>>({});
  const [sort, setSort] = useState<'cagr' | 'drop'>('cagr');
  const [followRes, setFollowRes] = useState<{ years: { year: number; ret: number; bench: number }[] } | null>(null);
  const { holdings } = useHoldings();
  const mineHold = useMemo(() => holdingsStrategy(holdings.map((h) => h.symbol)), [holdings]);
  const all = useMemo(() => [...TEMPLATES.map((t) => t.strategy), ...mine, ...(mineHold ? [mineHold] : [])], [mine, mineHold]);
  useEffect(() => {
    if (!lab) return;
    let alive = true;
    (async () => {
      // figures saved from last time for the same data show at once; only new or changed strategies are worked out,
      // one at a time with a pause between, so the screen stays responsive
      const saved = await labQuickPref.get();
      const keep = saved.built === lab.built ? saved.rows : {};
      const out: Record<string, Quick> = {};
      // saved rows from before the worst fall was kept have two figures: worked out again
      const ok = (k: string) => keep[k] && keep[k].length >= 3;
      for (const s of all) {
        const k = strategyKey(s);
        if (ok(k)) out[s.id] = { cagr: keep[k][0], bench: keep[k][1], drop: keep[k][2] };
      }
      if (alive) setQuick({ ...out });
      const rows: Record<string, number[]> = { ...keep };
      for (const s of all) {
        if (!alive) return;
        const k = strategyKey(s);
        if (ok(k)) continue;
        await new Promise((r) => setTimeout(r, 30));
        try {
          const r = runCached(lab, s);
          out[s.id] = { cagr: r.stats.cagr, bench: r.stats.benchCagr, drop: r.stats.maxDrop };
          rows[k] = [r.stats.cagr, r.stats.benchCagr, r.stats.maxDrop];
          if (alive) setQuick({ ...out });
        } catch {
          // shown without a figure
        }
      }
      // keep the saved figures to the strategies that still exist
      const live = new Set(all.map(strategyKey));
      await labQuickPref.set({ built: lab.built, rows: Object.fromEntries(Object.entries(rows).filter(([k]) => live.has(k))) });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [lab, all]);

  const open = (s: Strategy) => nav.navigate('LabResult', { id: s.id });
  // best first: highest a year, or the smallest worst fall
  const sorted = (l: Strategy[]) => [...l].sort((a, b) => (sort === 'cagr' ? (quick[b.id]?.cagr ?? -9) - (quick[a.id]?.cagr ?? -9) : (quick[b.id]?.drop ?? -9) - (quick[a.id]?.drop ?? -9)));
  useEffect(() => {
    if (!lab || !followed) return setFollowRes(null);
    const t = setTimeout(() => {
      try {
        setFollowRes({ years: runCached(lab, followed).years.slice(-8) });
      } catch {
        setFollowRes(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [lab, followed]);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Backtesting lab" />
      <ScrollView contentContainerStyle={styles.content}>
        <Rise style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontSize: 13.5, color: colors.text2, lineHeight: 19 }}>Try a rule on the past before real money.</T>
            {lab ? (
              <T v="caption" style={{ fontSize: 11.5 }}>
                {lab.stocks.length} stocks · {lab.days[0].slice(0, 4)}–{lab.days[lab.days.length - 1].slice(0, 4)} · after costs and tax{busy ? ' · checking for newer data…' : ''}
              </T>
            ) : null}
          </View>
          {lab ? <Button small label="+ New" style={{ paddingHorizontal: 16 }} onPress={() => nav.navigate('LabEdit', {})} /> : null}
        </Rise>
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
              <Rise delay={60}>
                <Press accessibilityRole="button" onPress={() => open(followed)} scaleTo={0.99} style={styles.follow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.badge}>
                      <T style={styles.badgeText}>Following</T>
                    </View>
                    <T style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15.5 }} numberOfLines={1}>
                      {followed.name}
                    </T>
                    <T v="caption" style={{ fontSize: 11.5 }}>
                      since {follow!.since}
                    </T>
                  </View>
                  {quick[followed.id] ? (
                    <View style={{ flexDirection: 'row' }}>
                      <Stat label="A year" value={pc(quick[followed.id].cagr)} color={changeColor(quick[followed.id].cagr)} />
                      <Stat
                        label="vs index"
                        value={`${quick[followed.id].cagr >= quick[followed.id].bench ? '+' : '−'}${Math.abs((quick[followed.id].cagr - quick[followed.id].bench) * 100).toFixed(1)} pts`}
                        color={changeColor(quick[followed.id].cagr - quick[followed.id].bench)}
                      />
                      <Stat label="Worst fall" value={pc(quick[followed.id].drop, 0)} color={colors.downText} />
                    </View>
                  ) : null}
                  {followRes?.years.length ? (
                    <View style={{ gap: 6 }}>
                      <T v="caption" style={{ fontSize: 11.5, fontFamily: fonts.bold }}>
                        Each year: strategy (strong) and index (light)
                      </T>
                      <YearBars years={followRes.years} />
                    </View>
                  ) : null}
                </Press>
              </Rise>
            ) : null}
            <Rise delay={100}>
              <Button label="Strategy hunt: let Sahm search for rules" tone="ghost" small onPress={() => nav.navigate('LabHunt')} />
            </Rise>
            {mine.length ? (
              <Rise delay={140} style={{ gap: 8 }}>
                <Panel style={{ paddingVertical: 0 }}>
                  <Head title="Your strategies" sort={sort} onSort={setSort} />
                  {sorted(mine).map((s, i, l) => (
                    <Row key={s.id} s={s} note={describe(s)} quick={quick[s.id]} onPress={() => open(s)} last={i === l.length - 1} />
                  ))}
                </Panel>
                {mine.length > 1 ? (
                  <Press accessibilityRole="button" onPress={() => nav.navigate('LabCompare', { ids: mine.slice(0, 3).map((s) => s.id) })} style={{ alignSelf: 'flex-start' }}>
                    <T style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 13.5 }}>Compare them side by side ›</T>
                  </Press>
                ) : null}
              </Rise>
            ) : null}
            {mineHold ? (
              <Section title="Your own holdings, tested">
                <Panel style={{ paddingVertical: 4 }}>
                  <Row s={mineHold} note="What your current stocks would have done if you'd bought them in equal amounts at the start." quick={quick[mineHold.id]} onPress={() => open(mineHold)} last />
                </Panel>
              </Section>
            ) : null}
            {asked.length ? (
              <Section title="Asked in the AI chat" action="Clear" onAction={() => labAskedPref.set([])}>
                <Panel style={{ paddingVertical: 4 }}>
                  {asked.slice(0, 6).map((a, i, all) => (
                    <Row key={a.strategy.id} s={a.strategy} note={`${a.at} · ${describe(a.strategy)}`} quick={null} onPress={() => open(a.strategy)} last={i === all.length - 1} />
                  ))}
                </Panel>
              </Section>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabDividends')} style={styles.link}>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>Who pays dividends when</T>
                <T v="caption" style={{ lineHeight: 17 }}>
                  Each month's usual payers across the market, from ten years of notices.
                </T>
              </View>
              <T v="caption">›</T>
            </Pressable>
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
            <Rise delay={180}>
              <Panel style={{ paddingVertical: 0 }}>
                <Head title="Ready-made ideas" sort={sort} onSort={setSort} />
                {sorted(TEMPLATES.map((t) => t.strategy)).map((st, i, l) => (
                  <Row key={st.id} s={st} note={TEMPLATES.find((t) => t.strategy.id === st.id)?.about ?? ''} quick={quick[st.id]} onPress={() => open(st)} last={i === l.length - 1} />
                ))}
              </Panel>
            </Rise>
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    num: { width: 58, textAlign: 'right', fontSize: 13 },
    head: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
    follow: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.hairline },
    badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.goldSoft },
    badgeText: { fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.gold },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    code: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.medium, fontSize: 14 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line },
  }),
);
