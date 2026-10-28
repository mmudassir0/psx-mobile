/** Build or change a strategy: which stocks, the rules they must pass, how they're ranked, when to sell, and the money. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { colors, fonts, space, themed } from '../theme';
import { findStrategy, getDraft, labStrategiesPref, setDraft, useLab } from '../lab/store';
import { earliestYear, METRICS, type Filter, type Metric, type Strategy } from '../lab/engine';
import { BASE, newId } from '../lab/templates';
import { describe, sectorName } from '../lab/describe';
import { labPrompt, readLabReply } from '../lab/aiStrategy';
import { useAi } from '../store/ai';
import { Panel } from '../ui/bits';
import { Button, IconButton, Section, Segmented, T } from '../ui/kit';

const METRIC_KEYS = Object.keys(METRICS) as Metric[];

function Chips<K extends string | number>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={String(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={[styles.chip, on && styles.chipOn]}>
            <T style={{ fontFamily: fonts.bold, fontSize: 13, color: on ? colors.onGold : colors.muted }}>{o.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function NumBox({ value, onChange, label, width = 110 }: { value: number; onChange: (v: number) => void; label: string; width?: number }) {
  const [text, setText] = useState(String(value));
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const v = Number(t.replace(/[^\d.-]/g, ''));
        if (t.trim() !== '' && Number.isFinite(v)) onChange(v);
      }}
      keyboardType="numeric"
      style={[styles.input, { width }]}
      accessibilityLabel={label}
      placeholderTextColor={colors.faint}
    />
  );
}

export default function LabEditScreen() {
  const nav = useNavigation();
  const { id } = useRoute<RouteProp<RootParams, 'LabEdit'>>().params ?? {};
  const mine = labStrategiesPref.use();
  const { lab } = useLab();
  const start = useMemo<Strategy>(() => {
    const s = id === 'draft' ? getDraft() : id ? findStrategy(id, mine) : null;
    if (!s) return { ...BASE, id: 'new', name: 'My strategy' };
    return s.id.startsWith('tpl-') ? { ...s, id: 'new', name: `${s.name} (mine)` } : { ...s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const [s, setS] = useState<Strategy>(start);
  const put = (p: Partial<Strategy>) => setS((x) => ({ ...x, ...p }));
  const saved = mine.some((x) => x.id === s.id);
  const first = lab ? earliestYear(lab) : 2018;
  const last = lab ? Number(lab.days[lab.days.length - 1].slice(0, 4)) : 2026;
  const years = Array.from({ length: Math.max(1, last - first) }, (_, k) => first + k);
  const ai = useAi();
  const [words, setWords] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const fromWords = async () => {
    if (!words.trim()) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await ai.run(
        () => labPrompt(words, s),
        () => {},
        700,
      );
      const reply = await r.gen.done;
      const got = readLabReply(reply, s);
      if (!got) setAiMsg("The AI's answer couldn't be turned into rules. Try saying it another way.");
      else {
        setS({ ...got.strategy, id: s.id });
        setRev((x) => x + 1);
        setAiMsg(got.note ? `Done. ${got.note}` : 'Done: check the rules below, then run it.');
      }
    } catch (e) {
      setAiMsg((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };
  const sectorList = useMemo(() => {
    const n = new Map<string, number>();
    for (const x of lab?.stocks ?? []) n.set(x.sector, (n.get(x.sector) ?? 0) + 1);
    return [...n]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([sec]) => sec);
  }, [lab]);
  const [showSectors, setShowSectors] = useState(!!start.sectors?.length);
  const toggleSector = (sec: string) => {
    const cur = s.sectors ?? [];
    const next = cur.includes(sec) ? cur.filter((x) => x !== sec) : [...cur, sec];
    put({ sectors: next.length ? next : undefined });
  };
  const setFilter = (k: number, f: Partial<Filter>) => put({ filters: s.filters.map((x, i) => (i === k ? { ...x, ...f } : x)) });

  const run = () => {
    setDraft({ ...s, id: 'draft' });
    nav.navigate('LabResult', { id: 'draft' });
  };
  const save = async () => {
    const out = { ...s, id: s.id === 'new' || s.id === 'draft' ? newId() : s.id, name: s.name.trim() || 'My strategy' };
    await labStrategiesPref.set([...mine.filter((x) => x.id !== out.id), out]);
    setS(out);
    nav.navigate('LabResult', { id: out.id });
  };
  const remove = async () => {
    await labStrategiesPref.set(mine.filter((x) => x.id !== s.id));
    nav.navigate('Lab');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }}>
          {saved ? 'Change strategy' : 'New strategy'}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput value={s.name} onChangeText={(name) => put({ name })} style={[styles.input, { width: '100%', textAlign: 'left', fontFamily: fonts.bold }]} accessibilityLabel="Strategy name" maxLength={40} />
        <View style={styles.summary}>
          <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
            {describe(s)}
          </T>
        </View>

        {ai.available ? (
          <Panel style={styles.panel}>
            <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Describe it in your own words</T>
            <TextInput
              value={words}
              onChangeText={setWords}
              multiline
              placeholder="e.g. Shariah stocks paying over 7% that are still above their 200-day average, 10 of them, checked every quarter"
              placeholderTextColor={colors.faint}
              style={[styles.input, { height: 84, textAlign: 'left', textAlignVertical: 'top', paddingTop: 10, fontFamily: fonts.medium }]}
              accessibilityLabel="Describe the strategy"
            />
            <Button label={aiBusy ? 'Turning it into rules…' : 'Turn it into rules'} small onPress={fromWords} disabled={aiBusy || !words.trim()} />
            {aiMsg ? (
              <T v="caption" style={{ lineHeight: 17 }}>
                {aiMsg}
              </T>
            ) : null}
          </Panel>
        ) : null}

        <Section title="1. Which stocks">
          <Panel style={styles.panel}>
            <Segmented
              options={[
                { key: 'all', label: 'All' },
                { key: 'kse100', label: 'KSE-100' },
                { key: 'kmi30', label: 'KMI-30' },
                { key: 'shariah', label: 'Shariah' },
              ]}
              value={s.universe}
              onChange={(universe) => put({ universe })}
            />
            <T v="caption">Traded at least, a day</T>
            <Chips label="Traded at least" options={[0, 1, 2, 5, 10, 25, 50].map((v) => ({ key: v, label: v ? `Rs ${v}M` : 'Any' }))} value={s.minValue} onChange={(minValue) => put({ minValue })} />
            <T v="caption" style={{ lineHeight: 17 }}>
              Thinly traded stocks are hard to buy and sell at the price shown, so a floor keeps the test honest.
            </T>
            <Pressable accessibilityRole="button" onPress={() => setShowSectors(!showSectors)}>
              <T style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 14 }}>
                {s.sectors?.length ? `Only ${s.sectors.length} sector${s.sectors.length > 1 ? 's' : ''} ${showSectors ? '▴' : '▾'}` : `Only some sectors ${showSectors ? '▴' : '▾'}`}
              </T>
            </Pressable>
            {showSectors ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sectorList.map((sec) => {
                  const on = !!s.sectors?.includes(sec);
                  return (
                    <Pressable key={sec} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleSector(sec)} style={[styles.chip, on && styles.chipOn]}>
                      <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: on ? colors.onGold : colors.muted, textTransform: 'capitalize' }}>{sectorName(sec)}</T>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <T v="caption">Sector rotation: first pick the sectors scoring best (on the ranking below)</T>
            <Chips label="Sector rotation" options={[0, 1, 2, 3, 4].map((v) => ({ key: v, label: v ? `Top ${v}` : 'Off' }))} value={s.topSectors ?? 0} onChange={(v) => put({ topSectors: v || undefined })} />
          </Panel>
        </Section>

        <Section title="2. Only if (all must pass)">
          <Panel style={styles.panel}>
            {s.filters.length ? null : <T v="caption">No rules: every stock above can be chosen.</T>}
            {s.filters.map((f, k) => (
              <View key={k} style={styles.filter}>
                <Chips label="Measure" options={METRIC_KEYS.map((m) => ({ key: m, label: METRICS[m].label }))} value={f.m} onChange={(m) => setFilter(k, { m })} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Segmented
                    options={[
                      { key: '>', label: 'Above' },
                      { key: '<', label: 'Under' },
                    ]}
                    value={f.op}
                    onChange={(op) => setFilter(k, { op })}
                  />
                  <NumBox key={`${k}-${f.m}-${rev}`} value={f.v} onChange={(v) => setFilter(k, { v })} label={`${METRICS[f.m].label} value`} width={80} />
                  <T v="caption">{METRICS[f.m].unit}</T>
                  <View style={{ flex: 1 }} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Remove this rule" onPress={() => put({ filters: s.filters.filter((_, i) => i !== k) })} hitSlop={10}>
                    <T style={{ color: colors.downText, fontSize: 18, fontFamily: fonts.bold }}>×</T>
                  </Pressable>
                </View>
                <T v="caption" style={{ lineHeight: 16 }}>
                  {METRICS[f.m].hint}
                </T>
              </View>
            ))}
            {s.filters.length < 6 ? (
              <Pressable accessibilityRole="button" onPress={() => put({ filters: [...s.filters, { m: 'trend200', op: '>', v: 0 }] })}>
                <T style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 14 }}>+ Add a rule</T>
              </Pressable>
            ) : null}
          </Panel>
        </Section>

        <Section title="3. Pick the best by">
          <Panel style={styles.panel}>
            <Chips label="Rank by" options={METRIC_KEYS.map((m) => ({ key: m, label: METRICS[m].label }))} value={s.rank} onChange={(rank) => put({ rank })} />
            <Segmented
              options={[
                { key: 'hi', label: 'Highest first' },
                { key: 'lo', label: 'Lowest first' },
              ]}
              value={s.desc ? 'hi' : 'lo'}
              onChange={(k) => put({ desc: k === 'hi' })}
            />
            <T v="caption">How many to hold</T>
            <Chips label="How many" options={[1, 3, 5, 8, 10, 12, 15, 20, 30, 50].map((v) => ({ key: v, label: String(v) }))} value={s.hold} onChange={(hold) => put({ hold })} />
            <T v="caption">Most from one sector</T>
            <Chips label="Most from one sector" options={[0, 1, 2, 3, 5].map((v) => ({ key: v, label: v ? String(v) : 'No limit' }))} value={s.perSector} onChange={(perSector) => put({ perSector })} />
            <T v="caption">Share of money in each</T>
            <Segmented
              options={[
                { key: 'equal', label: 'The same' },
                { key: 'lowvol', label: 'More in calmer ones' },
              ]}
              value={s.weight}
              onChange={(weight) => put({ weight })}
            />
          </Panel>
        </Section>

        <Section title="4. When to check and sell">
          <Panel style={styles.panel}>
            <T v="caption">Check the list and swap stocks</T>
            <Segmented
              options={[
                { key: '1', label: 'Monthly' },
                { key: '3', label: '3 months' },
                { key: '6', label: '6 months' },
                { key: '12', label: 'Yearly' },
              ]}
              value={String(s.every) as '1' | '3' | '6' | '12'}
              onChange={(k) => put({ every: Number(k) as 1 | 3 | 6 | 12 })}
            />
            <T v="caption">Sell early if it falls from its best price since buying</T>
            <Chips label="Stop" options={[0, 0.1, 0.15, 0.2, 0.25, 0.3].map((v) => ({ key: v, label: v ? `${Math.round(v * 100)}%` : 'Off' }))} value={s.stop} onChange={(stop) => put({ stop })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                Sell early if it drops under its 200-day average
              </T>
              <Switch value={s.exit200} onValueChange={(exit200) => put({ exit200 })} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
            </View>
            <T v="caption" style={{ lineHeight: 17 }}>
              Money from an early sale waits in cash until the next check.
            </T>
            <T v="caption">Sit in cash when the market is weak (fewer stocks than this above their 200-day average)</T>
            <Chips
              label="Weak market"
              options={[0, 0.3, 0.4, 0.5].map((v) => ({ key: v, label: v ? `Under ${Math.round(v * 100)}%` : 'Off' }))}
              value={s.pauseBelow ?? 0}
              onChange={(v) => put({ pauseBelow: v || undefined })}
            />
          </Panel>
        </Section>

        <Section title="5. Your money">
          <Panel style={styles.panel}>
            <T v="caption">Start in</T>
            <Chips label="Start year" options={years.map((y) => ({ key: y, label: String(y) }))} value={Math.max(first, Math.min(s.from, last - 1))} onChange={(from) => put({ from })} />
            <View style={styles.line}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                To start (Rs)
              </T>
              <NumBox key={`lump${rev}`} value={s.lump} onChange={(lump) => put({ lump: Math.max(0, lump) })} label="Money to start in rupees" />
            </View>
            <View style={styles.line}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                Each month (Rs)
              </T>
              <NumBox key={`monthly${rev}`} value={s.monthly} onChange={(monthly) => put({ monthly: Math.max(0, monthly) })} label="Money each month in rupees" />
            </View>
            <View style={styles.line}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                Count trading costs (0.2% each way)
              </T>
              <Switch value={s.costs} onValueChange={(costs) => put({ costs })} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
            </View>
            <View style={styles.line}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                Cash waiting earns money-market profit (about what such funds paid each year)
              </T>
              <Switch value={!!s.cashEarns} onValueChange={(v) => put({ cashEarns: v || undefined })} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.surface} />
            </View>
            <T v="caption">Tax on dividends and gains</T>
            <Segmented
              options={[
                { key: 'filer', label: 'Filer' },
                { key: 'nonfiler', label: 'Non-filer' },
                { key: 'none', label: 'Leave out' },
              ]}
              value={s.tax}
              onChange={(tax) => put({ tax })}
            />
            <T v="caption">Compare with</T>
            <Segmented
              options={[
                { key: 'KSE100', label: 'KSE-100' },
                { key: 'KMI30', label: 'KMI-30' },
              ]}
              value={s.bench}
              onChange={(bench) => put({ bench })}
            />
          </Panel>
        </Section>

        <Button label="Run it" onPress={run} disabled={!lab} />
        <Button label={saved ? 'Save changes' : 'Save and run'} tone="ghost" onPress={save} disabled={!lab} />
        {saved ? <Button label="Delete this strategy" tone="down" small onPress={remove} /> : null}
        {!lab ? <T v="caption">Waiting for the lab's data…</T> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ground },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 48, gap: 16 },
    panel: { paddingVertical: 12, gap: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
    input: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.mono, fontSize: 15, textAlign: 'right' },
    filter: { gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    summary: { backgroundColor: colors.goldSoft, borderRadius: 12, padding: 12 },
  }),
);
