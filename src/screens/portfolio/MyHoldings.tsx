/** Your real portfolio: value, profit, and Sahm's review of each holding. */
import React, { useEffect, useMemo, useState } from 'react';
import { useFlags } from '../../flags';
import { Skeleton } from '../../ui/Skeleton';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, themed } from '../../theme';
import { fmtDay, fmtNum, fmtPkr, fmtPrice, fmtSigned } from '../../format';
import { currentRights, dividendTaxRate, payerKind, recentBonus, rightsMaths, upcomingPayout, type Dividends } from '../../analysis/dividends';
import { applyBonus, setHoldings } from '../../portfolio/holdings';
import { appliedBonusesPref, boughtPref, taxStatusPref } from '../../portfolio/prefs';
import { BOUGHT_LABEL, heldSince2023, saleLine, saleTax, type Bought } from '../../portfolio/tax';
import { useMarket } from '../../store/market';
import { useHoldings } from '../../portfolio/holdings';
import { Row, useReviews } from '../../portfolio/useReviews';
import type { Action } from '../../portfolio/review';
import { usePicksFeed } from '../../picks/feed';
import { shortSector } from '../../sectors';
import { Panel } from '../../ui/bits';
import { StressCard } from '../../ui/StressCard';
import { PlanCard } from '../../ui/PlanCard';
import { resultsLine } from '../../analysis/results';
import { TradeSheet } from '../../ui/TradeSheet';
import { pkToday, record } from '../../journal/store';
import { Button, Empty, Section, Segmented, T } from '../../ui/kit';
import { SectorMix } from '../../ui/SectorMix';
import { PerformanceCard } from '../../ui/PerformanceCard';
import { ZakatCard } from '../../ui/ZakatCard';
import { GoalCard } from '../../ui/GoalCard';
import { TargetBox } from '../../ui/TargetBox';
import { HealthCard } from '../../ui/HealthCard';
import { TaxYearCard } from '../../ui/TaxYearCard';
import { useTrackSnapshot } from '../../portfolio/track';

const ORDER: Action[] = ['Review', 'Trim', 'Add more', 'Hold'];
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;

function actionTone(a: Action, watch: boolean): [string, string] {
  if (a === 'Review') return [colors.downText, colors.downSoft];
  if (a === 'Trim') return [colors.gold, colors.goldSoft];
  if (a === 'Add more') return [colors.up, colors.upSoft];
  return watch ? [colors.text, colors.surface2] : [colors.muted, colors.surface2];
}

/** One-line, tappable summaries of a holding's payout and results; tap for the full detail. */
function Pills({ r, taxRate, onPress }: { r: Row; taxRate: number; onPress: () => void }) {
  const up = upcomingPayout(r.dividends);
  const items: { text: string; bg: string }[] = [];
  if (up) {
    const net = up.dps * r.holding.shares * (1 - taxRate);
    const what = [up.dps > 0 ? `Rs ${fmtNum(net, 0)} net` : '', up.bonusPct > 0 ? `${up.bonusPct}% bonus` : ''].filter(Boolean).join(' + ');
    items.push({
      text: `💸 ${what} · buy by ${fmtDay(up.lastBuyDay)}`,
      bg: colors.upSoft,
    });
  }
  if (r.results?.latest?.fresh) items.push({ text: '📊 Results out', bg: colors.surface2 });
  else if (r.results?.meetingNotice) items.push({ text: '📅 Results due soon', bg: colors.surface2 });
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((it) => (
        <Pressable key={it.text} accessibilityRole="button" onPress={onPress} style={[styles.pill, { backgroundColor: it.bg }]}>
          <T
            style={{
              fontFamily: fonts.semibold,
              fontSize: 12.5,
              color: colors.text2,
            }}
            numberOfLines={1}
          >
            {it.text}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const BOUGHT_ORDER: Bought[] = ['recent', '2022-24', '2013-22', 'pre2013'];

/** "If you sold everything now": gain, capital gains tax and what you'd keep, with when the shares were bought. */
function SaleTaxLine({ r }: { r: Row }) {
  const status = taxStatusPref.use();
  const bought = boughtPref.use();
  const b = bought[r.holding.symbol] ?? 'recent';
  const t = saleTax(r.holding.shares, r.price, r.holding.avgCost, status, b, heldSince2023());
  return (
    <View style={styles.taxBox}>
      <T v="caption" style={{ fontFamily: fonts.bold, color: colors.text2 }}>
        If you sold all of it now
      </T>
      <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
        {saleLine(t, (v) => fmtNum(v, 0))}
      </T>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => boughtPref.set({ ...bought, [r.holding.symbol]: BOUGHT_ORDER[(BOUGHT_ORDER.indexOf(b) + 1) % BOUGHT_ORDER.length] })}
      >
        <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
          Bought: {BOUGHT_LABEL[b]} ▾ (tap to change; older shares are taxed less)
        </T>
      </Pressable>
    </View>
  );
}

/** A rights issue on this holding: what you're entitled to, and with the offer price, what it costs and what the rights are worth. */
function RightsBox({ r }: { r: Row }) {
  const ri = currentRights(r.dividends);
  const [offer, setOffer] = useState('');
  if (!ri) return null;
  const n = Math.floor((r.holding.shares * ri.pct) / 100);
  const o = Number(offer.replace(/,/g, ''));
  const m = o > 0 ? rightsMaths(r.holding.shares, ri.pct, r.price, o) : null;
  return (
    <View style={styles.rights}>
      <T v="caption" style={{ fontFamily: fonts.bold, color: colors.text2 }}>
        {ri.pct}% rights issue: {fmtNum(n, 0)} new shares offered to you
      </T>
      <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
        {ri.phase === 'before'
          ? `Book closure ${fmtDay(ri.bookClosure)}: hold the shares by the end of ${fmtDay(ri.lastBuyDay)} to be offered them.`
          : `Book closure was ${fmtDay(ri.bookClosure)}. You can pay for the new shares (subscribe) by the date in the company's notice, or sell the rights on PSX while they trade for a few days. Doing neither throws away whatever the rights are worth. If you subscribe, record it with "Bought or sold" at the offer price once the new shares reach your account.`}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="caption" style={{ flex: 1 }}>
          Offer price from the company's notice (Rs)
        </T>
        <TextInput value={offer} onChangeText={setOffer} keyboardType="decimal-pad" placeholder="e.g. 10" placeholderTextColor={colors.faint} style={styles.offer} accessibilityLabel="Rights offer price" />
      </View>
      {m ? (
        <T v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
          Subscribing costs Rs {fmtNum(m.cost, 0)} for {fmtNum(m.entitled, 0)} shares. Once the new shares exist the price should settle near Rs{' '}
          {m.terp.toFixed(2)} (from {fmtPrice(r.price)}), so each right is worth about Rs {m.perRight.toFixed(2)}
          {m.perRight > 0 ? `: Rs ${fmtNum(m.valueOfRights, 0)} in all, which you'd lose by doing nothing.` : '. The offer is above the market price, so subscribing costs more than buying on the market.'}
        </T>
      ) : null}
    </View>
  );
}

function HoldingCard({
  r,
  onOpen,
  taxRate,
  applied,
  holdingsAll,
}: {
  r: Row;
  onOpen: () => void;
  taxRate: number;
  applied: string[];
  holdingsAll: Row['holding'][];
}) {
  const flags = useFlags();
  const nav = useNavigation();
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
      <TargetBox symbol={r.holding.symbol} price={r.price} avgCost={r.holding.avgCost} fairMid={rv?.upside != null ? r.price * (1 + rv.upside) : null} />
      <Pressable accessibilityRole="button" hitSlop={4} onPress={() => nav.navigate('SellPlan', { symbol: r.holding.symbol })}>
        <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
          Plan a sale: what you'd have in hand ›
        </T>
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
          {!open ? <Pills r={r} taxRate={taxRate} onPress={() => setOpen(true)} /> : null}
          {flags('rights') ? <RightsBox r={r} /> : null}
          {open &&
            (() => {
              const up = upcomingPayout(r.dividends);
              if (!up) return null;
              const net = up.dps * r.holding.shares * (1 - taxRate);
              return (
                <View style={styles.payout}>
                  <T
                    v="body"
                    style={{
                      fontSize: 13,
                      lineHeight: 18,
                      color: colors.text2,
                    }}
                  >
                    Next payout: {up.dps > 0 ? `about Rs ${fmtNum(net, 0)} after tax on your ${fmtNum(r.holding.shares, 0)} shares` : ''}
                    {up.dps > 0 && up.bonusPct > 0 ? ' plus ' : ''}
                    {up.bonusPct > 0
                      ? Math.floor((r.holding.shares * up.bonusPct) / 100) >= 1
                        ? `${up.bonusPct}% bonus shares (about ${fmtNum(Math.floor((r.holding.shares * up.bonusPct) / 100), 0)})`
                        : `${up.bonusPct}% bonus shares (under one share on your holding, so paid in cash)`
                      : ''}
                    . Book closure {fmtDay(up.bookClosure)}; buy by {fmtDay(up.lastBuyDay)} to qualify.
                  </T>
                </View>
              );
            })()}
          {(() => {
            const b = recentBonus(r.dividends);
            const key = b ? `${r.holding.symbol}:${b.key}` : '';
            // under one whole share there's nothing to add: the fraction is paid in cash
            if (!b || applied.includes(key) || Math.floor((r.holding.shares * b.pct) / 100) < 1) return null;
            return (
              <View style={styles.payout}>
                <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                  {b.pct}% bonus shares, book closure {fmtDay(b.bookClosure)}. Once they show in your broker account, add them here so shares and
                  average price stay right.
                </T>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={async () => {
                      await setHoldings(applyBonus(holdingsAll, r.holding.symbol, b.pct));
                      await appliedBonusesPref.set([...applied, key]);
                    }}
                  >
                    <T
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 13.5,
                        color: colors.gold,
                      }}
                    >
                      Add {b.pct}% bonus shares
                    </T>
                  </Pressable>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => appliedBonusesPref.set([...applied, key])}>
                    <T
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 13.5,
                        color: colors.muted,
                      }}
                    >
                      Already done
                    </T>
                  </Pressable>
                </View>
              </View>
            );
          })()}
          {open && (r.results?.latest?.fresh || r.results?.meetingNotice) ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => r.results?.latest?.url && Linking.openURL(r.results.latest.url)}
              style={styles.results}
            >
              <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                {r.results!.latest?.fresh
                  ? resultsLine(r.results!.latest!)
                  : `Board meeting notice on ${fmtDay(Date.parse(r.results!.meetingNotice!.date + 'T12:00:00Z'))}: results are probably due within days.`}
              </T>
            </Pressable>
          ) : null}
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
                  <T
                    v="body"
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      lineHeight: 19,
                      color: colors.text2,
                    }}
                  >
                    {t}
                  </T>
                </View>
              ))}
              {rv.checks.map((t) => (
                <View key={t} style={styles.check}>
                  <T
                    v="body"
                    style={{
                      fontSize: 13,
                      lineHeight: 18,
                      color: colors.text2,
                    }}
                  >
                    Check: {t}
                  </T>
                </View>
              ))}
              {r.dividends && r.dividends.list.length ? (
                <T v="caption" style={{ lineHeight: 18 }}>
                  Dividends: Rs {r.dividends.ttm.toFixed(2)} a share in the last 12 months
                  {r.dividends.ttm > 0
                    ? `, about Rs ${fmtNum(r.dividends.ttm * r.holding.shares * (1 - taxRate), 0)} after ${(taxRate * 100).toFixed(1).replace(/\.0$/, '')}% tax on your ${fmtNum(r.holding.shares, 0)} shares (Rs ${fmtNum(r.dividends.ttm * r.holding.shares, 0)} before tax)`
                    : ''}
                  .
                </T>
              ) : null}
              <T v="caption">Bought at an average of {fmtPrice(r.holding.avgCost)}. Your buy price isn't used in the decision.</T>
              {flags('tax') ? <SaleTaxLine r={r} /> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 22 }}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpen((v) => !v)}>
              <T
                style={{
                  fontFamily: fonts.semibold,
                  fontSize: 13.5,
                  color: colors.gold,
                }}
              >
                {open ? 'Hide reasons' : 'Why?'}
              </T>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setTrading((v) => !v)}>
              <T
                style={{
                  fontFamily: fonts.semibold,
                  fontSize: 13.5,
                  color: colors.gold,
                }}
              >
                Bought or sold
              </T>
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

export function MyHoldings({ view: viewProp, onView }: { view?: 'holdings' | 'invest' | 'risk'; onView?: (v: 'holdings' | 'invest' | 'risk') => void } = {}) {
  const nav = useNavigation();
  const { stocks, bySymbol } = useMarket();
  const { holdings, loaded } = useHoldings();
  const taxStatus = taxStatusPref.use();
  const applied = appliedBonusesPref.use();
  const { feed } = usePicksFeed();
  const [newTrade, setNewTrade] = useState(false);
  const on = useFlags();
  const [ownView, setOwnView] = useState<'holdings' | 'invest' | 'risk'>('holdings');
  const view = viewProp ?? ownView;
  const setView = (v: 'holdings' | 'invest' | 'risk') => (onView ? onView(v) : setOwnView(v));
  const breadth = feed?.breadth ?? null;
  const { rows, total, sectors, loading, candles } = useReviews(holdings, stocks, bySymbol, breadth);
  // Keep a record of each holding decision shown, to score it later.
  useEffect(() => {
    if (loading) return;
    for (const r of rows)
      if (r.review)
        record({
          symbol: r.holding.symbol,
          day: pkToday(),
          kind: 'holding',
          call: r.review.action,
          price: r.price,
        });
  }, [loading, rows]);
  useTrackSnapshot(rows, loading);
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
  if (!loaded)
    return (
      <View style={styles.content}>
        <Skeleton kind="cards" n={4} />
      </View>
    );
  if (!holdings.length)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Empty
          title="Add your real holdings"
          body="Type or paste each holding as: symbol, shares, average price. They are saved on this phone only."
        />
        <Button label="Add holdings" onPress={() => nav.navigate('EditHoldings')} />
      </ScrollView>
    );

  const invested = holdings.reduce((a, h) => a + h.shares * h.avgCost, 0);
  const pnl = total - invested;
  const income = rows.reduce((a, r) => a + (r.dividends?.ttm ?? 0) * r.holding.shares, 0);
  const rateOf = (r: Row) => dividendTaxRate(taxStatus, payerKind(r.stock?.sector ?? (r.fund ? 'ETF' : null)));
  const netIncome = rows.reduce((a, r) => a + (r.dividends?.ttm ?? 0) * r.holding.shares * (1 - rateOf(r)), 0);
  const upcoming = rows
    .map((r) => ({ r, up: upcomingPayout(r.dividends) }))
    .filter((x): x is { r: Row; up: NonNullable<ReturnType<typeof upcomingPayout>> } => !!x.up)
    .sort((a, b) => a.up.bookClosure - b.up.bookClosure);
  const counts = ORDER.map((a) => [a, rows.filter((r) => r.review?.action === a).length] as const).filter(([, n]) => n > 0);
  const watching = rows.filter((r) => r.review?.watch).length;
  const reported = rows.filter((r) => r.results?.latest?.fresh).map((r) => r.holding.symbol);
  const due = rows.filter((r) => !r.results?.latest?.fresh && r.results?.meetingNotice).map((r) => r.holding.symbol);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={{ paddingVertical: 16, gap: 10 }}>
        <T v="caption">Market value</T>
        <T v="monoXl">{fmtPkr(total)}</T>
        <T v="mono" style={{ color: changeColor(pnl) }}>
          {fmtSigned(pnl, 0)} ({pct(invested ? total / invested - 1 : 0)}) on {fmtNum(invested, 0)} invested
        </T>
        {!loading && income > 0 ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            Dividends: about Rs {fmtNum(netIncome, 0)} a year after tax as a {taxStatus === 'filer' ? 'filer' : 'non-filer'} (
            {((netIncome / total) * 100).toFixed(1)}% yield), Rs {fmtNum(income, 0)} before tax, at the last 12 months' rate
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
          Only {Math.round(breadth * 100)}% of liquid PSX stocks are above their 200-day average, so most chart warnings below reflect the whole
          market falling, not these companies.
        </T>
      ) : null}

      <Segmented
        options={[
          { key: 'holdings', label: 'Holdings' },
          { key: 'invest', label: 'Invest cash' },
          { key: 'risk', label: 'Returns & risk' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'holdings' ? (
        <>
          {newTrade ? (
            <TradeSheet onDone={() => setNewTrade(false)} />
          ) : (
            <Button label="Record a trade" tone="ghost" onPress={() => setNewTrade(true)} />
          )}

          {!loading && (reported.length || due.length) ? (
            <Panel style={{ paddingVertical: 12, gap: 4 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Results season</T>
              {reported.length ? (
                <T v="caption">Reported this week: {reported.join(', ')}. Their decisions below already use the new numbers.</T>
              ) : null}
              {due.length ? <T v="caption">Results due soon (board meeting called): {due.join(', ')}.</T> : null}
            </Panel>
          ) : null}

          {!loading && upcoming.length ? (
            <Section title="Upcoming payouts" action={on('dividends') ? 'All companies' : undefined} onAction={() => nav.navigate('Dividends')}>
              <Panel style={{ paddingVertical: 6 }}>
                {upcoming.map(({ r, up }, i) => (
                  <View key={r.holding.symbol} style={[styles.upRow, i < upcoming.length - 1 && styles.upBorder]}>
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <T style={{ fontFamily: fonts.heavy, fontSize: 15 }}>{r.holding.symbol}</T>
                      <T v="caption">
                        Book closure {fmtDay(up.bookClosure)} · buy by {fmtDay(up.lastBuyDay)}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {up.dps > 0 ? (
                        <T v="mono" style={{ fontSize: 14.5 }}>
                          Rs {fmtNum(up.dps * r.holding.shares * (1 - rateOf(r)), 0)}
                        </T>
                      ) : null}
                      <T v="caption">
                        {up.dps > 0 ? `Rs ${up.dps.toFixed(2)}/share, after tax` : ''}
                        {up.dps > 0 && up.bonusPct > 0 ? ' + ' : ''}
                        {up.bonusPct > 0 ? `${up.bonusPct}% bonus` : ''}
                      </T>
                    </View>
                  </View>
                ))}
              </Panel>
              <T v="caption" style={{ lineHeight: 18 }}>
                "Buy by" counts two working days back from book closure, as PSX settles a day after the trade, skipping weekends and PSX
                holidays. Moon-dependent holidays can move, so check the ex-date in your broker app if it's close.
              </T>
            </Section>
          ) : null}

          <Section title="Holdings" action="Edit all" onAction={() => nav.navigate('EditHoldings')}>
            {sorted.map((r) => (
              <HoldingCard
                key={r.holding.symbol}
                r={r}
                taxRate={rateOf(r)}
                applied={applied}
                holdingsAll={holdings}
                onOpen={() => nav.navigate('Stock', { symbol: r.holding.symbol })}
              />
            ))}
          </Section>
        </>
      ) : null}

      {view === 'invest' ? (
        <>
        {on('summary') ? (
          <Section title="Your goals" action="Monthly summary" onAction={() => nav.navigate('Summary')}>
            <GoalCard value={total} tracked={null} />
          </Section>
        ) : null}
        <Section title="Where should new money go?">
          {loading ? <T v="caption">Waiting for every holding's review…</T> : <PlanCard rows={rows} breadth={breadth} />}
        </Section>
        </>
      ) : null}

      {view === 'risk' ? (
        <>
          {on('health') ? (
            <>
              <Section title="Health check">
                {loading ? <T v="caption">Checking every holding…</T> : <HealthCard rows={rows} />}
              </Section>
              <Section title="How you're doing">
                <PerformanceCard rows={rows} candles={candles} loading={loading} />
              </Section>
            </>
          ) : null}
          <SectorMix
            items={rows.map((r) => ({
              sector: r.stock?.sector ?? 'Other',
              value: r.value,
              shariah: !!r.stock?.shariah,
            }))}
          />

          <Section title="By sector">
            <Panel style={{ paddingVertical: 10 }}>
              {sectors.map(([name, w]) => (
                <View key={name} style={styles.sector}>
                  <T v="body" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                    {shortSector(name)}
                  </T>
                  <T
                    v="mono"
                    style={{
                      fontSize: 14,
                      color: w > 0.35 ? colors.downText : colors.text,
                    }}
                  >
                    {(w * 100).toFixed(1)}%
                  </T>
                </View>
              ))}
            </Panel>
          </Section>

          {on('tax') ? (
            <Section title="Tax on sales this year">
              <TaxYearCard rows={rows} />
            </Section>
          ) : null}

          {on('zakat') ? (
            <Section title="Zakat on your shares">
              {loading ? <T v="caption">Waiting for every holding's figures…</T> : <ZakatCard rows={rows} />}
            </Section>
          ) : null}

          {on('health') ? (
            <Section title="Stress test">
              {loading ? <T v="caption">Waiting for every holding's price history…</T> : <StressCard rows={stressRows} candles={candles} />}
            </Section>
          ) : null}
        </>
      ) : null}
      <Pressable accessibilityRole="link" onPress={() => nav.navigate('Record')} hitSlop={8}>
        <T
          style={{
            fontFamily: fonts.semibold,
            fontSize: 14,
            color: colors.gold,
          }}
        >
          How have these decisions done? ›
        </T>
      </Pressable>
      <T v="caption" style={{ lineHeight: 18 }}>
        Review means the business has weakened (losses or falling earnings). Trim means one holding is over 20% of your money, or it is far above fair
        value with a broken chart. Add more needs a price below fair value, an uptrend, and under 10% of your portfolio. A weak chart alone only says
        watch. A second opinion from fixed rules, not advice.
      </T>
    </ScrollView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 18,
      paddingBottom: 36,
    },
    rights: { backgroundColor: colors.goldSoft, borderRadius: 8, padding: 8, gap: 4 },
    offer: { width: 90, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingHorizontal: 8, fontFamily: fonts.mono, color: colors.text },
    taxBox: { backgroundColor: colors.surface2, borderRadius: 8, padding: 8, gap: 3 },
    check: { backgroundColor: colors.goldSoft, borderRadius: 8, padding: 8 },
    results: { backgroundColor: colors.surface2, borderRadius: 8, padding: 8 },
    payout: { backgroundColor: colors.upSoft, borderRadius: 8, padding: 8 },
    upRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    upBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    pill: {
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      maxWidth: '100%',
    },
    chip: {
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sector: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  }),
);
