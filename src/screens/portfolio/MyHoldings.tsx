/** Your real portfolio: value, profit, and Sahm's review of each holding. */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, themed } from '../../theme';
import { fmtDay, fmtNum, fmtPkr, fmtPrice, fmtSigned } from '../../format';
import type { Dividends } from '../../analysis/dividends';
import { useMarket } from '../../store/market';
import { useHoldings } from '../../portfolio/holdings';
import { Row, useReviews } from '../../portfolio/useReviews';
import type { Action } from '../../portfolio/review';
import { usePicksFeed } from '../../picks/feed';
import { shortSector } from '../../sectors';
import { Panel } from '../../ui/bits';
import { StressCard } from '../../ui/StressCard';
import { TradeSheet } from '../../ui/TradeSheet';
import { pkToday, record } from '../../journal/store';
import { Button, Empty, Loading, Section, T } from '../../ui/kit';

const nextClosure = (d: Dividends) => d.list.map((p) => p.bookClosure).filter((t): t is number => t != null && t > Date.now()).sort()[0] ?? null;
const ORDER: Action[] = ['Review', 'Trim', 'Add more', 'Hold'];
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;

function actionTone(a: Action, watch: boolean): [string, string] {
  if (a === 'Review') return [colors.downText, colors.downSoft];
  if (a === 'Trim') return [colors.gold, colors.goldSoft];
  if (a === 'Add more') return [colors.up, colors.upSoft];
  return watch ? [colors.text, colors.surface2] : [colors.muted, colors.surface2];
}

function HoldingCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [trading, setTrading] = useState(false);
  const rv = r.review;
  const [fg, bg] = rv ? actionTone(rv.action, rv.watch) : [colors.muted, colors.surface2];
  const pnl = rv?.pnl ?? r.value - r.holding.shares * r.holding.avgCost;
  const pnlPct = rv?.pnlPct ?? 0;
  return (
    <Panel style={{ paddingVertical: 14, gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 17 }}>{r.holding.symbol}</T>
          <T v="caption">
            {fmtNum(r.holding.shares, 0)} × {fmtPrice(r.price)} · {(r.weight * 100).toFixed(1)}% of portfolio
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T v="mono" style={{ fontSize: 15 }}>
            {fmtNum(r.value, 0)}
          </T>
          <T v="mono" style={{ fontSize: 13, color: changeColor(pnl) }}>
            {fmtSigned(pnl, 0)} ({pct(pnlPct)})
          </T>
        </View>
      </Pressable>
      {rv ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.chip, { backgroundColor: bg }]}>
              <T style={{ fontFamily: fonts.bold, fontSize: 13.5, color: fg }}>
                {rv.action}
                {rv.watch ? ', watch' : ''}
              </T>
            </View>
            <T v="caption" style={{ flex: 1 }} numberOfLines={open ? undefined : 2}>
              {rv.headline}
            </T>
          </View>
          {open ? (
            <View style={{ gap: 5 }}>
              {[
                ...rv.fundamentalBreaks.map((t) => ['■', colors.downText, t] as const),
                ...rv.technicalBreaks.map((t) => ['▼', colors.downText, t] as const),
                ...rv.bad.map((t) => ['–', colors.gold, t] as const),
                ...rv.good.map((t) => ['+', colors.up, t] as const),
              ].map(([icon, color, t]) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <T style={{ width: 12, color, fontSize: 13, lineHeight: 19 }}>{icon}</T>
                  <T v="body" style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
                    {t}
                  </T>
                </View>
              ))}
              {rv.checks.map((t) => (
                <View key={t} style={styles.check}>
                  <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                    Check: {t}
                  </T>
                </View>
              ))}
              {r.dividends && r.dividends.list.length ? (
                <T v="caption" style={{ lineHeight: 18 }}>
                  Dividends: Rs {r.dividends.ttm.toFixed(2)} a share in the last 12 months
                  {r.dividends.ttm > 0 ? `, about Rs ${fmtNum(r.dividends.ttm * r.holding.shares, 0)} on your ${fmtNum(r.holding.shares, 0)} shares` : ''}
                  {nextClosure(r.dividends) ? `. Next book closure ${fmtDay(nextClosure(r.dividends)!)}` : ''}.
                </T>
              ) : null}
              <T v="caption">Bought at an average of {fmtPrice(r.holding.avgCost)}. Your buy price isn't used in the decision.</T>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 22 }}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpen((v) => !v)}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>{open ? 'Hide reasons' : 'Why?'}</T>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setTrading((v) => !v)}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Bought or sold</T>
            </Pressable>
          </View>
          {trading ? <TradeSheet symbol={r.holding.symbol} price={r.price} onDone={() => setTrading(false)} /> : null}
        </>
      ) : (
        <T v="caption">Checking…</T>
      )}
    </Panel>
  );
}

export function MyHoldings() {
  const nav = useNavigation();
  const { stocks, bySymbol } = useMarket();
  const { holdings, loaded } = useHoldings();
  const { feed } = usePicksFeed();
  const [newTrade, setNewTrade] = useState(false);
  const breadth = feed?.breadth ?? null;
  const { rows, total, sectors, loading, candles } = useReviews(holdings, stocks, bySymbol, breadth);
  // Keep a record of each holding decision shown, to score it later.
  useEffect(() => {
    if (loading) return;
    for (const r of rows) if (r.review) record({ symbol: r.holding.symbol, day: pkToday(), kind: 'holding', call: r.review.action, price: r.price });
  }, [loading, rows]);
  const stressRows = useMemo(() => rows.map((r) => ({ symbol: r.holding.symbol, value: r.value })), [rows]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ka = a.review ? ORDER.indexOf(a.review.action) * 2 + (a.review.watch ? 0 : 1) : 9;
        const kb = b.review ? ORDER.indexOf(b.review.action) * 2 + (b.review.watch ? 0 : 1) : 9;
        return ka - kb || b.value - a.value;
      }),
    [rows],
  );
  if (!loaded) return <Loading />;
  if (!holdings.length)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Empty title="Add your real holdings" body="Type or paste each holding as: symbol, shares, average price. They are saved on this phone only." />
        <Button label="Add holdings" onPress={() => nav.navigate('EditHoldings')} />
      </ScrollView>
    );

  const invested = holdings.reduce((a, h) => a + h.shares * h.avgCost, 0);
  const pnl = total - invested;
  const income = rows.reduce((a, r) => a + (r.dividends?.ttm ?? 0) * r.holding.shares, 0);
  const counts = ORDER.map((a) => [a, rows.filter((r) => r.review?.action === a).length] as const).filter(([, n]) => n > 0);
  const watching = rows.filter((r) => r.review?.watch).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={{ paddingVertical: 16, gap: 10 }}>
        <T v="caption">Market value</T>
        <T v="monoXl">{fmtPkr(total)}</T>
        <T v="mono" style={{ color: changeColor(pnl) }}>
          {fmtSigned(pnl, 0)} ({pct(invested ? total / invested - 1 : 0)}) on {fmtNum(invested, 0)} invested
        </T>
        {!loading && income > 0 ? (
          <T v="caption">
            Dividends: about Rs {fmtNum(income, 0)} a year at the last 12 months' rate ({((income / total) * 100).toFixed(1)}% yield)
          </T>
        ) : null}
        {!loading ? (
          <T v="body" style={{ fontSize: 14, color: colors.text2 }}>
            {counts.map(([a, n]) => `${n} ${a.toLowerCase()}`).join(' · ')}
            {watching ? ` (${watching} to watch)` : ''}
          </T>
        ) : (
          <T v="caption">Checking each holding…</T>
        )}
      </Panel>
      {breadth != null && breadth < 0.5 ? (
        <T v="caption" style={{ lineHeight: 18 }}>
          Only {Math.round(breadth * 100)}% of liquid PSX stocks are above their 200-day average, so most chart warnings below reflect the
          whole market falling, not these companies.
        </T>
      ) : null}

      {newTrade ? (
        <TradeSheet onDone={() => setNewTrade(false)} />
      ) : (
        <Button label="Record a trade" tone="ghost" onPress={() => setNewTrade(true)} />
      )}

      <Section title="Holdings" action="Edit all" onAction={() => nav.navigate('EditHoldings')}>
        {sorted.map((r) => (
          <HoldingCard key={r.holding.symbol} r={r} onOpen={() => nav.navigate('Stock', { symbol: r.holding.symbol })} />
        ))}
      </Section>

      <Section title="Stress test">
        {loading ? <T v="caption">Waiting for every holding's price history…</T> : <StressCard rows={stressRows} candles={candles} />}
      </Section>

      <Section title="By sector">
        <Panel style={{ paddingVertical: 10 }}>
          {sectors.map(([name, w]) => (
            <View key={name} style={styles.sector}>
              <T v="body" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                {shortSector(name)}
              </T>
              <T v="mono" style={{ fontSize: 14, color: w > 0.35 ? colors.downText : colors.text }}>
                {(w * 100).toFixed(1)}%
              </T>
            </View>
          ))}
        </Panel>
      </Section>
      <Pressable accessibilityRole="link" onPress={() => nav.navigate('Record')} hitSlop={8}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.gold }}>How have these decisions done? ›</T>
      </Pressable>
      <T v="caption" style={{ lineHeight: 18 }}>
        Review means the business has weakened (losses or falling earnings). Trim means one holding is over 20% of your money, or it
        is far above fair value with a broken chart. Add more needs a price below fair value, an uptrend, and under 10% of your
        portfolio. A weak chart alone only says watch. A second opinion from fixed rules, not advice.
      </T>
    </ScrollView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 14, gap: 18, paddingBottom: 36 },
    check: { backgroundColor: colors.goldSoft, borderRadius: 8, padding: 8 },
    chip: { paddingHorizontal: 10, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    sector: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  }),
);
