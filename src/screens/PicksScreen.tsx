import React, { useEffect, useMemo, useState } from 'react';
import { snapshots, trackReturns, type Snap } from '../portfolio/track';
import { picksVsMine } from '../picks/vsMine';
import { Skeleton } from '../ui/Skeleton';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useMarket } from '../store/market';
import { usePicksFeed } from '../picks/feed';
import { ListId, LISTS, LiveRecord, liveVerdict, RULES, ScoredPick, Stats, TESTED, TESTED_PERIODS } from '../picks/build';
import { SETUP_NAMES } from '../analysis/picks';
import { PickCard, RESULT_LABEL } from '../ui/PickCard';
import { LongTermCard } from '../ui/LongTermCard';
import { Panel } from '../ui/bits';
import { StaleNote } from '../ui/StaleNote';
import { Empty, IconButton, Section, Segmented, T } from '../ui/kit';

const day = (d: string) => fmtDay(Date.parse(d + 'T12:00:00Z'));
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

function StatsLine({ s, label }: { s: Stats; label: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
        {label}
      </T>
      {s.picks === 0 ? (
        <T v="caption">None finished yet.</T>
      ) : (
        <T v="caption" style={{ lineHeight: 18 }}>
          {s.picks} finished, {s.bought} bought; {s.bought ? `${s.won} made money (${Math.round((s.won / s.bought) * 100)}%), average ${pct(s.avgRet ?? 0)} per trade after costs` : 'none reached the buy zone'}.
        </T>
      )}
    </View>
  );
}

/** The finished picks against your own portfolio over the same days. */
function VsMine({ feed }: { feed: { recent: ScoredPick[]; open: ScoredPick[] } }) {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  useEffect(() => {
    snapshots().then(setSnaps);
  }, []);
  const r = useMemo(() => (snaps && snaps.length > 1 ? picksVsMine(feed.recent, trackReturns(snaps)) : null), [snaps, feed.recent]);
  const pc = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
  if (!r) return null;
  return (
    <Section title="Picks against your portfolio">
      <Panel style={{ paddingVertical: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <View>
            <T v="caption">Sahm's picks</T>
            <T v="mono" style={{ fontSize: 20, color: r.picks >= 0 ? colors.up : colors.downText }}>
              {pc(r.picks)}
            </T>
          </View>
          <View>
            <T v="caption">Your portfolio, same days</T>
            <T v="mono" style={{ fontSize: 20, color: r.mine >= 0 ? colors.up : colors.downText }}>
              {pc(r.mine)}
            </T>
          </View>
        </View>
        <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
          {Math.abs(r.picks - r.mine) < 0.005 ? 'About the same on average.' : r.picks > r.mine ? 'The picks did better on average.' : 'Your portfolio did better on average.'} The pick won in {r.better} of {r.n} cases.
        </T>
        <T v="caption" style={{ lineHeight: 17 }}>
          Average return of the {r.n} finished picks from their pick day to the day they closed{r.from ? ` (from ${fmtDay(Date.parse(r.from + 'T12:00:00Z'))})` : ''}, against your real return over exactly those days, from Sahm's daily record. A pick is one stock held for weeks; your portfolio is spread, so it usually moves less either way.
        </T>
      </Panel>
    </Section>
  );
}

function LiveCard({ live }: { live: LiveRecord }) {
  return (
    <Panel style={{ paddingVertical: 14, gap: 12 }}>
      <T v="caption">
        Every pick in this list since {live.since ? day(live.since) : 'the start'}, in strong and weak markets, against the {TESTED_PERIODS.p2} backtest.
      </T>
      {(['momentum', 'pullback'] as const).map((k) => {
        const r = live.bySetup[k];
        const v = liveVerdict(r, k);
        const tone = v.tone === 'worse' ? colors.downText : v.tone === 'better' || v.tone === 'ok' ? colors.up : colors.text2;
        return (
          <View key={k} style={{ gap: 3 }}>
            <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
              {SETUP_NAMES[k]}
            </T>
            <T v="caption" style={{ lineHeight: 18 }}>
              {r.picks} picked · {r.bought} bought and finished{r.running ? ` · ${r.running} running` : ''}
              {r.bought ? ` · ${r.won} won · ${r.stops} stopped out · average ${pct(r.avgRet ?? 0)} (test ${pct(TESTED[k].p2.avg)})` : ''}
            </T>
            <T v="caption" style={{ lineHeight: 18, color: tone }}>
              {v.text}
            </T>
          </View>
        );
      })}
    </Panel>
  );
}

function ResultRow({ p, last }: { p: ScoredPick; last: boolean }) {
  const tone = p.ret == null ? colors.muted : p.ret > 0 ? colors.up : colors.downText;
  return (
    <View style={[styles.result, !last && styles.border]}>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
          {p.symbol}
          {p.weak ? <T v="caption"> · watch only</T> : null}
        </T>
        <T v="caption">
          {day(p.day)} · {RESULT_LABEL[p.result]}
        </T>
      </View>
      <T v="mono" style={{ fontSize: 14.5, color: tone }}>
        {p.ret == null ? '—' : pct(p.ret)}
      </T>
    </View>
  );
}

export default function PicksScreen({ asTab }: { asTab?: boolean } = {}) {
  const nav = useNavigation();
  const { bySymbol } = useMarket();
  const { feeds, error, loading, reload } = usePicksFeed();
  const [list, setList] = useState<ListId>('all');
  const feed = feeds?.[list] ?? null;
  const label = LISTS.find((l) => l.id === list)!.label;
  const [how, setHow] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  const price = (s: string) => bySymbol.get(s)?.price ?? null;
  const open = (symbol: string) => nav.navigate('Stock', { symbol });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topbar}>
        {asTab ? <View style={{ width: 44 }} /> : <IconButton name="back" label="Back" filled={false} onPress={() => nav.goBack()} />}
        <T v="title" style={{ fontSize: 16 }}>
          {asTab ? 'Ideas' : 'Daily picks'}
        </T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} progressBackgroundColor={colors.surface} />}
      >
        <Segmented options={LISTS.map((l) => ({ key: l.id, label: l.label }))} value={list} onChange={setList} />
        <StaleNote feed={feed} />
        {!feed ? (
          loading ? (
            <Skeleton kind="cards" n={3} label="Loading today's picks" />
          ) : (
            <Empty
              title={feeds ? `No ${label} picks yet` : 'No picks yet'}
              body={feeds ? 'This list starts with the next run after the close.' : `${error ?? 'Nothing published yet'}. Picks are made every trading day after the close.`}
            />
          )
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <T v="caption">From the closing prices of {day(feed.day)}</T>
              <View style={[styles.market, { backgroundColor: feed.marketOk ? colors.upSoft : colors.downSoft }]}>
                <T v="body" style={{ fontFamily: fonts.bold, color: feed.marketOk ? colors.up : colors.downText }}>
                  {feed.marketOk ? 'Market strong' : 'Market weak: watch only'}
                </T>
                <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
                  {feed.breadth != null ? `${Math.round(feed.breadth * 100)}% of liquid stocks are above their 200-day average. ` : ''}
                  {feed.marketOk
                    ? 'Picks are shown when at least half are.'
                    : 'When fewer than half are, the setups below are for watching, not buying: in the backtest, most trades made in weak markets lost.'}
                </T>
              </View>
            </View>

            <Section title={`${feed.marketOk ? "Today's picks" : 'Setups to watch'}: ${label}`}>
              {!feed.marketOk && !showWeak ? (
                <Panel style={{ paddingVertical: 14, gap: 8 }}>
                  <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                    No trades today. {feed.weakStats.bought ? `In this weak market ${feed.weakStats.won} of the last ${feed.weakStats.bought} setups that reached their buy zone made money.` : ''} The
                    setups are kept and scored so the record stays honest, but they aren't suggestions to buy.
                  </T>
                  {feed.picks.length ? (
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowWeak(true)}>
                      <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>Show the {feed.picks.length} setups anyway ›</T>
                    </Pressable>
                  ) : null}
                </Panel>
              ) : feed.picks.length === 0 ? (
                <Empty title="No setups today" body={list === 'all' ? 'No liquid stock met the rules at the last close.' : `No ${label} stock met the rules at the last close.`} />
              ) : (
                feed.picks.map((p) => <PickCard key={p.symbol} p={p} price={price(p.symbol)} onOpen={() => open(p.symbol)} />)
              )}
              <T v="caption" style={{ lineHeight: 18 }}>
                Buy only inside the zone within {feed.rules.wait} trading days. Sell half at TP1 and move the stop to your buy price;
                sell the rest at TP2, the stop, or after {feed.rules.hold} trading days.
              </T>
            </Section>

            <Section title="Long-term list (experiment)">
              <LongTermCard />
            </Section>

            {feed.open.length ? (
              <Section title="Earlier picks still in play">
                {feed.open.map((p) => (
                  <PickCard key={p.symbol + p.day} p={p} price={price(p.symbol)} bought={!!p.filled} onOpen={() => open(p.symbol)} />
                ))}
              </Section>
            ) : null}

            <VsMine feed={feed} />

            {feed.live ? (
              <Section title={`Live record vs testing: ${label}`}>
                <LiveCard live={feed.live} />
              </Section>
            ) : null}

            <Section title={`Scorecard: ${label}, last 90 days`}>
              <Panel style={{ paddingVertical: 14, gap: 12 }}>
                <StatsLine s={feed.stats} label="Picks (strong market)" />
                <StatsLine s={feed.weakStats} label="Watch only (weak market)" />
              </Panel>
              {feed.recent.length ? (
                <Panel>
                  {feed.recent.map((p, i) => (
                    <ResultRow key={p.symbol + p.day} p={p} last={i === feed.recent.length - 1} />
                  ))}
                </Panel>
              ) : null}
              <T v="caption" style={{ lineHeight: 18 }}>
                Every pick is scored by the same rules after it is made, including the ones that lost. Results include 0.3% trading costs.
              </T>
            </Section>

            <Section title="How picks are made">
              <Panel style={{ paddingVertical: 14, gap: 10 }}>
                <T v="body" style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                  Every evening Sahm scans stocks trading at least Rs 5M a day (all shares, or only KSE-100 or KMI-30 members) for two setups: {SETUP_NAMES.momentum.toLowerCase()} (technical score 7.5 or more)
                  and {SETUP_NAMES.pullback.toLowerCase()} (a dip to the 20-day average while above the 50- and 200-day). The {RULES.max} with
                  the highest score in each list are picked, so a stock can appear in more than one. Buy zone: half a day's range under the close. Stop: two day-ranges under the zone. TP1 and
                  TP2: one and three times the risk.
                </T>
                <Pressable accessibilityRole="button" onPress={() => setHow((v) => !v)} hitSlop={8}>
                  <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>{how ? 'Hide the backtest' : 'How did this do in testing?'}</T>
                </Pressable>
                {how ? (
                  <View style={{ gap: 6 }}>
                    {(['momentum', 'pullback'] as const).map((k) => (
                      <T key={k} v="caption" style={{ lineHeight: 18 }}>
                        {SETUP_NAMES[k]}: {TESTED_PERIODS.p1} won {Math.round(TESTED[k].p1.won * 100)}% of trades, average {pct(TESTED[k].p1.avg)};{' '}
                        {TESTED_PERIODS.p2} won {Math.round(TESTED[k].p2.won * 100)}%, average {pct(TESTED[k].p2.avg)}.
                      </T>
                    ))}
                    <T v="caption" style={{ lineHeight: 18 }}>
                      Buying any liquid stock on any day with the same levels did almost as well, so most of the recent gains came from
                      the rising market, not the setups. Faster group-style trades (tight stop, quick targets) lost money in every
                      test. Not investment advice.
                    </T>
                  </View>
                ) : null}
              </Panel>
            </Section>
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: space.section },
    market: { borderRadius: 14, padding: 14, gap: 4 },
    result: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
