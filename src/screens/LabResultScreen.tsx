/** One strategy replayed: the money over time against the index, falls, each year, trades, and what it holds now. */
import React, { useEffect, useMemo, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { RootParams } from '../nav/types';
import { changeColor, colors, fonts, space, themed } from '../theme';
import { fmtCompact, fmtNum } from '../format';
import { findStrategy, labFollowPref, labStrategiesPref, setDraft, useLab } from '../lab/store';
import { ensureReady } from '../notify';
import { runBacktest, type Result, type Strategy } from '../lab/engine';
import { describe } from '../lab/describe';
import { robustness, type Variant } from '../lab/robust';
import { newId } from '../lab/templates';
import { LabChart } from '../ui/LabChart';
import { RuleWhatIf, ContributorsSection, RealSection, ReportButton, RollingSection, ShareCodeButton, StressSection } from '../ui/LabExtras';
import { Panel } from '../ui/bits';
import { Button, Empty, IconButton, Loading, Section, Segmented, T } from '../ui/kit';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
const rs = (v: number) => `Rs ${fmtNum(Math.round(v), 0)}`;

function Fig({ k, v, c, sub }: { k: string; v: string; c?: string; sub?: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 8, paddingRight: 8, gap: 2 }}>
      <T v="caption">{k}</T>
      <T style={{ fontFamily: fonts.bold, fontSize: 16, color: c ?? colors.text }}>{v}</T>
      {sub ? (
        <T v="caption" style={{ fontSize: 11 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

export default function LabResultScreen() {
  const nav = useNavigation();
  const { id } = useRoute<RouteProp<RootParams, 'LabResult'>>().params;
  const mine = labStrategiesPref.use();
  const { lab, busy, error } = useLab();
  const st = findStrategy(id, mine);
  const [res, setRes] = useState<Result | null>(null);
  const [view, setView] = useState<'money' | 'growth'>('money');
  const [log, setLog] = useState(false);
  const [trades, setTrades] = useState(30);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  useEffect(() => {
    if (!lab || !st) return;
    setRes(null);
    setVariants(null);
    const task = InteractionManager.runAfterInteractions(() => {
      const r = runBacktest(lab, st);
      setRes(r);
      setTimeout(() => setVariants(robustness(lab, st, r)), 50);
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab, st && JSON.stringify(st)]);

  const days = useMemo(() => (lab && res ? lab.days.slice(res.start) : []), [lab, res]);
  const drops = useMemo(() => {
    if (!res) return null;
    const a = (g: Float64Array) => {
      const out = new Float64Array(g.length);
      let peak = 0;
      for (let t = 0; t < g.length; t++) {
        peak = Math.max(peak, g[t]);
        out[t] = (g[t] / peak - 1) * 100;
      }
      return out;
    };
    return { mine: a(res.growth), bench: a(res.benchGrowth) };
  }, [res]);
  const growth100 = useMemo(() => (res ? { mine: res.growth.map((v) => v * 100), bench: res.benchGrowth.map((v) => v * 100) } : null), [res]);
  const saved = !!st && mine.some((s) => s.id === st.id);
  const follow = labFollowPref.use();
  const following = !!st && follow?.id === st.id;
  const benchName = st?.bench === 'KMI30' ? 'KMI-30' : 'KSE-100';

  const save = async () => {
    if (!st) return;
    const s: Strategy = st.id.startsWith('tpl-') || st.id.startsWith('hunt-') || st.id === 'draft' ? { ...st, id: newId() } : st;
    await labStrategiesPref.set([...mine.filter((x) => x.id !== s.id), s]);
    nav.setParams({ id: s.id });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />
        <T v="title" style={{ fontSize: 16 }} numberOfLines={1}>
          {st?.name ?? 'Strategy'}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!st ? (
          <Empty title="This strategy isn't here any more" body="It may have been deleted." />
        ) : !lab ? (
          busy ? (
            <Loading label="Downloading the lab's data…" />
          ) : (
            <Empty title="The lab's data isn't here yet" body={error ?? ''} />
          )
        ) : !res ? (
          <Loading label="Replaying ten years…" />
        ) : (
          <>
            <T v="body" style={{ fontSize: 14, color: colors.text2, lineHeight: 20 }}>
              {describe(st)}
            </T>
            <Panel style={{ paddingVertical: 14, gap: 6 }}>
              <T v="caption">
                From {lab.days[res.start]} · {rs(res.stats.put)} put in
              </T>
              <T style={{ fontFamily: fonts.heavy, fontSize: 28 }}>{rs(res.stats.final)}</T>
              <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                <T style={{ fontFamily: fonts.bold, color: changeColor(res.stats.cagr) }}>{pc(res.stats.cagr)} a year</T> against {pc(res.stats.benchCagr)} for the {benchName} index with its dividends. The same money in
                the index would be {rs(res.bench[res.bench.length - 1])}.
              </T>
              <T v="caption" style={{ color: res.stats.cagr > res.stats.benchCagr ? colors.up : colors.downText, fontFamily: fonts.semibold }}>
                {res.stats.cagr > res.stats.benchCagr
                  ? `Beat the index by ${((res.stats.cagr - res.stats.benchCagr) * 100).toFixed(1)} points a year`
                  : `Behind the index by ${((res.stats.benchCagr - res.stats.cagr) * 100).toFixed(1)} points a year`}
              </T>
            </Panel>
            {res.warnings.map((w) => (
              <View key={w} style={styles.warn}>
                <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
                  {w}
                </T>
              </View>
            ))}

            <Section title="Over time">
              <Panel style={{ paddingVertical: 12, gap: 10 }}>
                <Segmented
                  options={[
                    { key: 'money', label: 'Your money' },
                    { key: 'growth', label: 'Rs 100 grew to' },
                  ]}
                  value={view}
                  onChange={setView}
                />
                {view === 'money' ? (
                  <LabChart
                    days={days}
                    log={log}
                    fmt={(v) => fmtCompact(v)}
                    series={[
                      { name: 'Strategy', values: res.value, color: colors.gold, width: 2.2 },
                      { name: benchName, values: res.bench, color: colors.muted, width: 1.5 },
                      { name: 'Put in', values: res.invested, color: colors.line, width: 1.2, dash: '4 4' },
                    ]}
                  />
                ) : (
                  <LabChart
                    days={days}
                    log={log}
                    fmt={(v) => v.toFixed(0)}
                    series={[
                      { name: 'Strategy', values: growth100!.mine, color: colors.gold, width: 2.2 },
                      { name: benchName, values: growth100!.bench, color: colors.muted, width: 1.5 },
                    ]}
                  />
                )}
                <Pressable accessibilityRole="switch" accessibilityState={{ checked: log }} onPress={() => setLog(!log)}>
                  <T v="caption" style={{ color: colors.gold }}>
                    {log ? '✓ ' : ''}Even scale (each doubling the same height)
                  </T>
                </Pressable>
                <T v="caption" style={{ lineHeight: 17 }}>
                  {view === 'money' ? 'What the account was worth, with the monthly money added.' : 'Growth without the money added, so the two lines compare like for like.'} Drag across the chart to read any day.
                </T>
              </Panel>
            </Section>

            <Section title="Falls from the top">
              <Panel style={{ paddingVertical: 12, gap: 8 }}>
                <LabChart
                  days={days}
                  height={130}
                  zero
                  fmt={(v) => `${v.toFixed(0)}%`}
                  series={[
                    { name: 'Strategy', values: drops!.mine, color: colors.down, width: 1.6, area: true },
                    { name: benchName, values: drops!.bench, color: colors.muted, width: 1.2 },
                  ]}
                />
                <T v="caption" style={{ lineHeight: 17 }}>
                  The worst fall was {pc(res.stats.maxDrop, 0)}, from {lab.days[res.stats.dropFrom]} to {lab.days[res.stats.dropTo]} ({benchName}: {pc(res.stats.benchMaxDrop, 0)}). Ask yourself if you'd have kept going
                  through that.
                </T>
              </Panel>
            </Section>

            <Section title="Key numbers">
              <Panel style={{ paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap' }}>
                <Fig k="A year (rules only)" v={pc(res.stats.cagr)} c={changeColor(res.stats.cagr)} sub={`${benchName} ${pc(res.stats.benchCagr)}`} />
                <Fig k="A year on your money" v={res.stats.irr != null ? pc(res.stats.irr) : '–'} sub="counts when you put it in" />
                <Fig k="Worst fall" v={pc(res.stats.maxDrop, 0)} c={colors.downText} sub={`${benchName} ${pc(res.stats.benchMaxDrop, 0)}`} />
                <Fig k="Ups and downs" v={`${(res.stats.vol * 100).toFixed(0)}%`} sub="a year (index-like is 20–25%)" />
                <Fig k="Months ahead of the index" v={`${Math.round(res.stats.monthsAhead * 100)}%`} />
                <Fig
                  k="Sales at a profit"
                  v={res.stats.winRate != null ? `${Math.round(res.stats.winRate * 100)}%` : '–'}
                  sub={res.stats.avgHeld != null ? `held ${Math.round(res.stats.avgHeld / 21)} months on average` : undefined}
                />
                <Fig k="Dividends received" v={rs(res.stats.dividends)} sub={res.stats.cashProfit > 0 ? `and ${rs(res.stats.cashProfit)} profit on cash` : 'after tax'} />
                <Fig k="Costs and tax" v={rs(res.stats.costs + res.stats.tax)} sub={`${rs(res.stats.costs)} costs`} />
                <Fig k="Trades" v={fmtNum(res.trades.length, 0)} sub={`${res.stats.rebalances} checks`} />
                <Fig
                  k="Time in shares"
                  v={`${Math.round(res.stats.invested * 100)}%`}
                  sub={res.stats.pauses ? `in cash ${res.stats.pauses} time${res.stats.pauses > 1 ? 's' : ''} for a weak market` : 'the rest waited in cash'}
                />
              </Panel>
            </Section>

            <Section title="Year by year">
              <Panel style={{ paddingVertical: 4 }}>
                <View style={[styles.yr, styles.border]}>
                  <T v="label" style={{ flex: 1 }}>
                    Year
                  </T>
                  <T v="label" style={styles.yn}>
                    Strategy
                  </T>
                  <T v="label" style={styles.yn}>
                    {benchName}
                  </T>
                  <T v="label" style={styles.yn}>
                    Difference
                  </T>
                </View>
                {res.years.map((y, i) => (
                  <View key={y.year} style={[styles.yr, i < res.years.length - 1 && styles.border]}>
                    <T style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 14 }}>
                      {y.year}
                      {i === res.years.length - 1 ? ' so far' : ''}
                    </T>
                    <T v="mono" style={[styles.yn, { color: changeColor(y.ret) }]}>
                      {pc(y.ret, 0)}
                    </T>
                    <T v="mono" style={[styles.yn, { color: colors.text2 }]}>
                      {pc(y.bench, 0)}
                    </T>
                    <T v="mono" style={[styles.yn, { color: changeColor(y.ret - y.bench) }]}>
                      {pc(y.ret - y.bench, 0)}
                    </T>
                  </View>
                ))}
              </Panel>
            </Section>

            <Section title={res.holdings.length ? `What it would hold now (${res.holdings.length})` : 'What it would hold now'}>
              {res.holdings.length ? (
                <Panel style={{ paddingVertical: 4 }}>
                  {res.holdings.map((h, i) => (
                    <Pressable key={h.symbol} accessibilityRole="button" onPress={() => nav.navigate('Stock', { symbol: h.symbol })} style={[styles.yr, i < res.holdings.length - 1 && styles.border]}>
                      <T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 14 }}>{h.symbol}</T>
                      <T v="caption" style={{ width: 90 }}>
                        since {lab.days[h.since].slice(0, 7)}
                      </T>
                      <T v="mono" style={[styles.yn, { color: changeColor(h.value / h.cost - 1) }]}>
                        {pc(h.value / h.cost - 1, 0)}
                      </T>
                    </Pressable>
                  ))}
                </Panel>
              ) : (
                <T v="caption">Nothing: it's all in cash right now ({rs(res.cash)}).</T>
              )}
              {res.lastPicks.length ? (
                <T v="caption" style={{ lineHeight: 17 }}>
                  At its last check it chose {res.lastPicks.join(', ')}. Stocks it would hold today, by these rules: not a recommendation to buy them.
                </T>
              ) : null}
            </Section>

            {variants ? (
              <Section title="Does it hold up?">
                <Panel style={{ paddingVertical: 4 }}>
                  {variants.map((v, i) => (
                    <View key={v.label} style={[styles.yr, i < variants.length - 1 && styles.border]}>
                      <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                        {v.label}
                      </T>
                      <T v="mono" style={[styles.yn, { color: changeColor(v.cagr - v.bench) }]}>
                        {pc(v.cagr)}
                      </T>
                    </View>
                  ))}
                </Panel>
                <T v="caption" style={{ lineHeight: 17 }}>
                  The same idea with small changes and in each half of the period, a year on average (green: ahead of the index). If small changes flip the result, the first result was probably luck.
                </T>
              </Section>
            ) : null}

            {st.only ? <RuleWhatIf lab={lab} st={st} /> : null}
            <StressSection lab={lab} st={st} res={res} />
            <ContributorsSection res={res} onOpen={(symbol) => nav.navigate('Stock', { symbol })} />
            <RollingSection lab={lab} st={st} />
            <RealSection lab={lab} st={st} />

            <Section title={`Trades (${res.trades.length})`}>
              <Panel style={{ paddingVertical: 4 }}>
                {res.trades
                  .slice()
                  .reverse()
                  .slice(0, trades)
                  .map((t, i) => (
                    <View key={`${t.i}${t.symbol}${t.side}${i}`} style={[styles.yr, styles.border]}>
                      <T v="caption" style={{ width: 78 }}>
                        {lab.days[t.i]}
                      </T>
                      <T style={{ fontFamily: fonts.bold, fontSize: 13, width: 70, color: t.side === 'buy' ? colors.up : colors.downText }}>{t.side === 'buy' ? 'Buy' : 'Sell'}</T>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 13, flex: 1 }}>{t.symbol}</T>
                      <T v="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                        {t.side === 'sell' && t.gain != null ? `${pc(t.gain, 0)}${t.why === 'stop' ? ' stop' : t.why === 'trend' ? ' trend' : ''}` : `@ ${t.price.toFixed(2)}`}
                      </T>
                    </View>
                  ))}
              </Panel>
              {trades < res.trades.length ? <Button label="Show more" tone="ghost" small onPress={() => setTrades(trades + 60)} /> : null}
            </Section>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label="Change the rules"
                style={{ flex: 1 }}
                onPress={() => {
                  if (id === 'draft') nav.goBack();
                  else nav.navigate('LabEdit', { id: st.id });
                }}
              />
              {!saved ? <Button label="Save it" tone="ghost" style={{ flex: 1 }} onPress={save} /> : null}
            </View>
            {saved || st.id.startsWith('tpl-') ? (
              <View style={styles.follow}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{following ? 'You follow this strategy' : 'Follow it with real money?'}</T>
                <T v="caption" style={{ lineHeight: 17 }}>
                  {following
                    ? 'On each check day Home shows what it would hold and which of those you don’t own, and a reminder comes that morning.'
                    : 'Sahm will remind you on each check day with what it would hold then. You decide what to buy or sell.'}
                </T>
                <Button
                  small
                  tone={following ? 'ghost' : 'gold'}
                  label={following ? 'Stop following' : 'Follow this strategy'}
                  onPress={async () => {
                    if (following) return labFollowPref.set(null);
                    await ensureReady();
                    await labFollowPref.set({ id: st.id, since: new Date().toISOString().slice(0, 10) });
                  }}
                />
              </View>
            ) : null}
            {saved || st.id.startsWith('tpl-') ? (
              <Button
                label="Compare with others"
                tone="ghost"
                onPress={() => nav.navigate('LabCompare', { ids: [st.id, ...mine.filter((s) => s.id !== st.id).map((s) => s.id), ...(st.id === 'tpl-kse100' ? [] : ['tpl-kse100'])].slice(0, 3) })}
              />
            ) : null}
            <ReportButton lab={lab} st={st} res={res} />
            {!st.only ? <ShareCodeButton st={st} /> : null}
            {saved ? (
              <Button
                label="Make a copy to try changes"
                tone="ghost"
                onPress={() => {
                  setDraft({ ...st, id: 'draft', name: `${st.name} (copy)` });
                  nav.navigate('LabEdit', { id: 'draft' });
                }}
              />
            ) : null}
            <T v="caption" style={{ lineHeight: 17 }}>
              How it's worked out: each check uses only the closes known the day before, and trades at that day's close. Costs are 0.2% each way; dividends are paid on the ex-date after{' '}
              {st.tax === 'none' ? 'no' : st.tax === 'filer' ? '15%' : '30%'} tax; gains are taxed at the end of each June. The index's own dividends are estimated from what its members paid, and added to it.{' '}
              {lab.listsFrom
                ? `Shariah and KMI-30 stocks follow the lists of the time from ${lab.listsFrom.slice(0, 4)} (the earliest known list before that); the KSE-100 uses today's list.`
                : "Today's index lists are used for the whole period."}{' '}
              Stocks that were delisted aren't in the data, which flatters every strategy a little. The past doesn't promise the future. Information, not advice.
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
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    yr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 6 },
    yn: { width: 74, textAlign: 'right', fontSize: 13 },
    warn: { backgroundColor: colors.goldSoft, borderRadius: 12, padding: 10 },
    follow: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.line },
  }),
);
