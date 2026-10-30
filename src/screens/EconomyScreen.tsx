/** Pakistan's economy in the numbers that move shares, with what each usually means for the market. */
import React, { useMemo } from 'react';
import { Termed } from '../ui/Explain';
import type { TermId } from '../analysis/glossary';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, space, themed } from '../theme';
import { fmtDay } from '../format';
import { useFeedFile } from '../picks/feed';
import { isMacroFeed, marketYields, type MacroFeed } from '../analysis/macro';
import { MPC_DATES } from '../analysis/events';
import { useMarket } from '../store/market';
import { Panel } from '../ui/bits';
import { Skeleton } from '../ui/Skeleton';
import { Empty, IconButton, Section, T, ScreenHeader } from '../ui/kit';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mlabel = (ym: string | null) => (ym ? `${MONTH[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '');
const p2 = (v: number | null | undefined) => (v == null ? '–' : `${v.toFixed(2).replace(/\.?0+$/, '')}%`);
const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 3) return null;
  const W = 120;
  const H = 34;
  const hi = Math.max(...data);
  const lo = Math.min(...data);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * W).toFixed(1)} ${(2 + ((hi - v) / (hi - lo || 1)) * (H - 4)).toFixed(1)}`).join('');
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={d} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

function Stat({ label, value, sub, spark, sparkColor, term }: { label: string; value: string; sub?: string; spark?: number[]; sparkColor?: string; term?: TermId }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {term ? <Termed label={label} id={term} /> : <T v="caption">{label}</T>}
        <T v="mono" style={{ fontSize: 20 }}>
          {value}
        </T>
        {sub ? <T v="caption" style={{ lineHeight: 17 }}>{sub}</T> : null}
      </View>
      {spark ? <Spark data={spark} color={sparkColor ?? colors.gold} /> : null}
    </View>
  );
}

export default function EconomyScreen() {
  const nav = useNavigation();
  const { data: f, loading, reload } = useFeedFile<MacroFeed>('macro.json', isMacroFeed);
  const { stocks } = useMarket();
  const y = useMemo(() => marketYields(stocks), [stocks]);
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const nextMpc = MPC_DATES.find((d) => d >= today) ?? null;

  const n = f?.now;
  const hist = f?.history ?? [];
  const usdChange = (() => {
    if (!n?.usd) return null;
    const monthAgo = hist.filter((r) => r[0] <= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) && r[2] != null).pop();
    return monthAgo?.[2] ? n.usd / monthAgo[2] - 1 : null;
  })();
  const inf = f?.inflation ?? [];
  const real = n?.policy != null && n.cpi != null ? n.policy - n.cpi : null;
  const gap = y.earningsYield != null && n?.tbills.m12 != null ? y.earningsYield - n.tbills.m12 : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Pakistan economy" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.gold} colors={[colors.gold]} />}>
        {!n ? (
          loading ? (
            <Skeleton kind="cards" n={3} />
          ) : (
            <Empty title="Not available yet" body="These figures come with the daily update after the close." />
          )
        ) : (
          <>
            <Section title="Shares against safe returns">
              <Panel style={{ paddingVertical: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Termed label="KSE-100 earnings yield" id="earningsYield" />
                    <T v="mono" style={{ fontSize: 20 }}>
                      {p2(y.earningsYield)}
                    </T>
                    <T v="caption">P/E {y.pe?.toFixed(1) ?? '–'} · dividends {p2(y.dividendYield)}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="caption">12-month T-bill</T>
                    <T v="mono" style={{ fontSize: 20 }}>
                      {p2(n.tbills.m12)}
                    </T>
                    <T v="caption">{n.tbills.asOf ? `auction ${n.tbills.asOf}` : ''}</T>
                  </View>
                </View>
                {gap != null ? (
                  <T v="body" style={{ fontSize: 14, lineHeight: 20, color: gap > 3 ? colors.up : gap < 0 ? colors.downText : colors.text2 }}>
                    {gap > 3
                      ? `Shares earn ${gap.toFixed(1)} points more than T-bills: cheap against safe returns.`
                      : gap >= 0
                        ? `Shares earn only ${gap.toFixed(1)} points more than T-bills: not much extra for the extra risk.`
                        : `T-bills pay ${(-gap).toFixed(1)} points more than shares earn: shares look expensive against safe returns.`}
                  </T>
                ) : null}
                <T v="caption" style={{ lineHeight: 17 }}>
                  Earnings yield is what the index's companies earn for each Rs 100 of their price (1 ÷ P/E), weighted by size. T-bills are what
                  the government pays with no risk. Shares usually need several points more to be worth holding instead.
                </T>
              </Panel>
            </Section>

            <Section title="Interest rates">
              <Panel style={{ paddingVertical: 4 }}>
                <Stat
                  term="policyRate"
                  label="State Bank policy rate"
                  value={p2(n.policy)}
                  sub={[n.mpc ? `Last decision: ${n.mpc.charAt(0).toUpperCase()}${n.mpc.slice(1)}` : null, nextMpc ? `Next decision ${fmtDay(dayT(nextMpc))}` : null].filter(Boolean).join('. ')}
                  spark={hist.map((r) => r[1]).filter((v): v is number => v != null).slice(-180)}
                />
                <View style={styles.hair} />
                <Stat term="tbill" label="T-bills (latest auction)" value={`${p2(n.tbills.m3)} · ${p2(n.tbills.m6)} · ${p2(n.tbills.m12)}`} sub="3, 6 and 12 months" />
                <View style={styles.hair} />
                <Stat label="Government bonds (PIBs)" value={`${p2(n.pibs.y3)} · ${p2(n.pibs.y5)} · ${p2(n.pibs.y10)}`} sub={`3, 5 and 10 years${n.pibs.asOf ? `, auction ${n.pibs.asOf}` : ''}`} />
                <View style={styles.hair} />
                <Stat term="kibor" label="KIBOR (what banks lend at)" value={`${p2(n.kibor.m3)} · ${p2(n.kibor.m6)}`} sub={`3 and 6 months${n.kibor.asOf ? `, ${n.kibor.asOf}` : ''}`} />
              </Panel>
              <T v="caption" style={{ lineHeight: 17 }}>
                Falling rates usually help shares (cheaper loans, lower T-bill returns to compete with), and banks' profits slip a little. Rising
                rates do the opposite.
              </T>
            </Section>

            <Section title="Prices and the rupee">
              <Panel style={{ paddingVertical: 4 }}>
                <Stat
                  label={`Inflation, year on year${n.cpiMonth ? ` (${mlabel(n.cpiMonth)})` : ''}`}
                  value={p2(n.cpi)}
                  sub={real != null ? `Policy rate minus inflation: ${real >= 0 ? '+' : ''}${real.toFixed(1)} points ${real > 2 ? '(rates well above inflation: room to cut)' : real < 0 ? '(rates below inflation: pressure to raise)' : ''}` : undefined}
                  spark={inf.map((r) => r[1])}
                  sparkColor={colors.downText}
                />
                <View style={styles.hair} />
                <Stat
                  label="Dollar (inter-bank)"
                  value={n.usd != null ? `Rs ${n.usd.toFixed(2)}` : '–'}
                  sub={usdChange != null ? `${usdChange >= 0 ? 'Up' : 'Down'} ${Math.abs(usdChange * 100).toFixed(1)}% in a month: a weaker rupee helps exporters (textiles, IT) and hurts importers.` : 'A weaker rupee helps exporters (textiles, IT) and hurts importers.'}
                  spark={hist.map((r) => r[2]).filter((v): v is number => v != null).slice(-180)}
                />
                <View style={styles.hair} />
                <Stat label="Petrol, per litre" value={n.petrol != null ? `Rs ${n.petrol.toFixed(2)}` : '–'} sub={n.petrolFrom ? `From the price notice of ${fmtDay(dayT(n.petrolFrom))}` : undefined} />
                <View style={styles.hair} />
                <Stat label="Foreign exchange reserves" value={n.reserves.total != null ? `$${(n.reserves.total / 1000).toFixed(1)} billion` : '–'} sub={n.reserves.asOf ? `State Bank $${((n.reserves.sbp ?? 0) / 1000).toFixed(1)} billion, as on ${n.reserves.asOf}` : undefined} />
              </Panel>
            </Section>
            <T v="caption" style={{ lineHeight: 18 }}>
              From the State Bank's homepage, the Bureau of Statistics and the petrol price notices, read after each close (
              {fmtDay(dayT(n.day))}). How these figures move the market is a pattern, not a rule.
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
    content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 36, gap: 18 },
    hair: { height: 1, backgroundColor: colors.hairline },
  }),
);
