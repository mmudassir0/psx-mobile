/** Your real portfolio: value, profit, and Sahm's review of each holding. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bonusAfter, canUndo } from '../../portfolio/bonusAuto';
import { undoBonus } from '../../portfolio/useAutoBonus';
import { rightsChoice } from '../../portfolio/rights';
import { useFlags } from '../../flags';
import { Skeleton } from '../../ui/Skeleton';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts, seriesColor, themed } from '../../theme';
import { fmtDay, fmtNum, fmtPkr, fmtPrice, fmtSigned } from '../../format';
import { currentRights, dividendTaxRate, payerKind, recentBonus, rightsMaths, upcomingPayout, type Dividends } from '../../analysis/dividends';
import { applyBonus, applyTrade, setHoldings } from '../../portfolio/holdings';
import { logTrade } from '../../portfolio/trades';
import { appliedBonusesPref, bonusLogPref, boughtPref, cashPref, taxStatusPref } from '../../portfolio/prefs';
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
import { CashBox } from '../../ui/CashBox';
import { resultsLine } from '../../analysis/results';
import { TradeSheet } from '../../ui/TradeSheet';
import { StarterPlanCard } from '../../ui/StarterPlanCard';
import { pkToday, record } from '../../journal/store';
import { Button, Empty, Section, Segmented, T } from '../../ui/kit';
import { Press, Rise, useCountUp } from '../../ui/motion';
import { AllocationRing, ringSlices } from '../../ui/AllocationRing';
import { ToolIcon } from '../../ui/ToolIcon';
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
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => boughtPref.set({ ...bought, [r.holding.symbol]: BOUGHT_ORDER[(BOUGHT_ORDER.indexOf(b) + 1) % BOUGHT_ORDER.length] })}>
        <T v="caption" style={{ color: colors.gold, fontFamily: fonts.semibold }}>
          Bought: {BOUGHT_LABEL[b]} ▾ (tap to change; older shares are taxed less)
        </T>
      </Pressable>
    </View>
  );
}

/** A rights issue on this holding: what you're entitled to, and with the offer price, what it costs and what the rights are worth. */
function RightsBox({ r, holdingsAll }: { r: Row; holdingsAll: Row['holding'][] }) {
  const ri = currentRights(r.dividends);
  const [offer, setOffer] = useState('');
  const [done, setDone] = useState(false);
  if (!ri) return null;
  const n = Math.floor((r.holding.shares * ri.pct) / 100);
  const o = Number(offer.replace(/,/g, ''));
  const m = o > 0 ? rightsMaths(r.holding.shares, ri.pct, r.price, o) : null;
  const ch = o > 0 ? rightsChoice(r.holding.shares, r.holding.avgCost, ri.pct, r.price, o) : null;
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
          Subscribing costs Rs {fmtNum(m.cost, 0)} for {fmtNum(m.entitled, 0)} shares. Once the new shares exist the price should settle near Rs {m.terp.toFixed(2)} (from {fmtPrice(r.price)}), so each right is worth
          about Rs {m.perRight.toFixed(2)}
          {m.perRight > 0 ? `: Rs ${fmtNum(m.valueOfRights, 0)} in all, which you'd lose by doing nothing.` : '. The offer is above the market price, so subscribing costs more than buying on the market.'}
        </T>
      ) : null}
      {ch && ch.entitled > 0 ? (
        <View style={{ gap: 4 }}>
          {[
            ['Subscribe', `pay Rs ${fmtNum(ch.cost, 0)}; ${fmtNum(ch.newShares, 0)} shares, average Rs ${ch.newAvg.toFixed(2)}`],
            ['Sell the rights', ch.perRight > 0 ? `get about Rs ${fmtNum(ch.sell.cash, 0)} (rights often trade a little below this)` : 'worth little or nothing at this offer'],
            ['Do nothing', ch.lostByNothing > 0 ? `lose about Rs ${fmtNum(ch.lostByNothing, 0)} of value` : 'no loss at this offer'],
          ].map(([k, v]) => (
            <T key={k} v="caption" style={{ lineHeight: 18, color: colors.text2 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.text }}>{k}: </T>
              {v}
            </T>
          ))}
          {ri.phase === 'after' ? (
            done ? (
              <T v="caption" style={{ color: colors.up }}>
                Added {fmtNum(ch.entitled, 0)} shares at Rs {o.toFixed(2)}.
              </T>
            ) : (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={async () => {
                  const res = applyTrade(holdingsAll, { symbol: r.holding.symbol, side: 'buy', shares: ch.entitled, price: o });
                  if (res.error) return;
                  await logTrade({ day: pkToday(), symbol: r.holding.symbol, side: 'buy', shares: ch.entitled, price: o, avgCost: r.holding.avgCost, realised: null });
                  await setHoldings(res.holdings);
                  setDone(true);
                }}
              >
                <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>
                  I subscribed: add {fmtNum(ch.entitled, 0)} shares at Rs {o.toFixed(2)}
                </T>
              </Pressable>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A small label and a figure on one line: "Avg  643.58" */
function Fig({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <T v="caption" style={{ fontSize: 11, width: 30 }}>
        {label}
      </T>
      <T v="mono" style={{ fontSize: 12.5 }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function HoldingCard({ r, onOpen, taxRate, applied, holdingsAll, color }: { r: Row; onOpen: () => void; taxRate: number; applied: string[]; holdingsAll: Row['holding'][]; color: string }) {
  const flags = useFlags();
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const [trading, setTrading] = useState(false);
  // three columns need about 420px (a four-digit price included); narrower phones keep the compact form
  const wide = useWindowDimensions().width >= 420;
  const bonusLog = bonusLogPref.use();
  const rv = r.review;
  const [fg, bg] = rv ? actionTone(rv.action, rv.watch) : [colors.muted, colors.surface2];
  const pnl = rv?.pnl ?? r.value - r.holding.shares * r.holding.avgCost;
  const pnlPct = rv?.pnlPct ?? 0;
  return (
    <Panel style={{ paddingVertical: 2, gap: 0 }}>
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint="Shows its review and actions"
        onPress={() => setOpen((o) => !o)}
        scaleTo={0.985}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
      >
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
        {/* left: what it is */}
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T style={{ fontFamily: fonts.heavy, fontSize: 16, flexShrink: 0 }} numberOfLines={1}>
              {r.holding.symbol}
            </T>
            {r.stock?.shariah ? <ToolIcon name="moon" size={13} color={colors.shariah} /> : null}
            {rv ? (
              <View style={[styles.tag, { backgroundColor: bg }]} accessibilityLabel={`${rv.action}${rv.watch ? ', watch' : ''}`}>
                <T style={[styles.tagText, { color: fg }]} numberOfLines={1}>
                  {rv.action}
                </T>
                {rv.watch ? <ToolIcon name="eye" size={13} color={fg} /> : null}
              </View>
            ) : null}
          </View>
          {wide ? (
            <>
              {r.stock?.sector ? (
                <T v="caption" style={{ fontSize: 11.5 }} numberOfLines={1}>
                  {shortSector(r.stock.sector)}
                </T>
              ) : null}
              <T v="caption" style={{ fontSize: 11.5 }} numberOfLines={1}>
                {fmtNum(r.holding.shares, 0)} shares
              </T>
            </>
          ) : (
            <>
              <T v="caption" style={{ fontFamily: fonts.mono }} numberOfLines={1}>
                {fmtNum(r.holding.shares, 0)} × {fmtPrice(r.price)}
              </T>
              <T v="caption" style={{ fontFamily: fonts.mono, fontSize: 11.5 }} numberOfLines={1}>
                avg {fmtPrice(r.holding.avgCost)}
              </T>
            </>
          )}
        </View>
        {/* middle (wide phones): today's price, what you paid, what you put in */}
        {wide ? (
          <View style={{ gap: 3 }} accessible accessibilityLabel={`now ${fmtPrice(r.price)}, average ${fmtPrice(r.holding.avgCost)}, cost ${fmtNum(r.holding.shares * r.holding.avgCost, 0)}`}>
            <Fig label="Now" value={fmtPrice(r.price)} />
            <Fig label="Avg" value={fmtPrice(r.holding.avgCost)} />
            <Fig label="Cost" value={fmtNum(r.holding.shares * r.holding.avgCost, 0)} />
          </View>
        ) : null}
        {/* right: worth now and the gain */}
        <View style={{ alignItems: 'flex-end', gap: 3, minWidth: 74 }}>
          <T v="mono" style={{ fontSize: 15 }}>
            {fmtNum(r.value, 0)}
          </T>
          <T v="mono" style={{ fontSize: 12.5, color: changeColor(pnl) }}>
            {fmtSigned(pnl, 0)}
          </T>
          <T v="mono" style={{ fontSize: 12, color: changeColor(pnl) }}>
            ({pct(pnlPct)})
          </T>
        </View>
      </Press>
      {open ? (
        <Rise style={{ gap: 10, paddingBottom: 14, paddingLeft: 16 }}>
          {rv ? (
            <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
              {rv.headline}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small tone="ghost" label="Plan a sale" style={{ flex: 1 }} onPress={() => nav.navigate('SellPlan', { symbol: r.holding.symbol })} />
            {r.price > 0 && r.price < r.holding.avgCost ? <Button small tone="ghost" label="Average down" style={{ flex: 1 }} onPress={() => nav.navigate('AverageDown', { symbol: r.holding.symbol })} /> : null}
            <Button small tone="ghost" label="Open" style={{ flex: 1 }} onPress={onOpen} />
          </View>
          <TargetBox symbol={r.holding.symbol} price={r.price} avgCost={r.holding.avgCost} fairMid={rv?.upside != null ? r.price * (1 + rv.upside) : null} />
          {rv ? <Pills r={r} taxRate={taxRate} onPress={onOpen} /> : null}
          {(() => {
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
        </Rise>
      ) : null}
      {rv ? (
        <>
          {flags('rights') ? <RightsBox r={r} holdingsAll={holdingsAll} /> : null}
          {bonusLog
            .filter((e) => e.symbol === r.holding.symbol && Date.now() - e.at < 45 * 864e5)
            .slice(-1)
            .map((e) => (
              <View key={e.key + e.at} style={styles.payout}>
                <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                  {e.auto ? 'Added by Sahm' : 'Added'} on {fmtDay(e.at)}: {e.pct}% bonus shares, {fmtNum(e.before.shares, 0)} → {fmtNum(e.after.shares, 0)} shares, average Rs {e.before.avgCost.toFixed(2)} → Rs{' '}
                  {e.after.avgCost.toFixed(2)}.
                </T>
                {canUndo(e, r.holding) ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => undoBonus(e)} style={{ marginTop: 4 }}>
                    <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>Undo</T>
                  </Pressable>
                ) : null}
              </View>
            ))}
          {(() => {
            const b = recentBonus(r.dividends);
            const key = b ? `${r.holding.symbol}:${b.key}` : '';
            // under one whole share there's nothing to add: the fraction is paid in cash
            if (!b || applied.includes(key) || Math.floor((r.holding.shares * b.pct) / 100) < 1) return null;
            return (
              <View style={styles.payout}>
                <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                  {b.pct}% bonus shares, book closure {fmtDay(b.bookClosure)}. Once they show in your broker account, add them here so shares and average price stay right.
                </T>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={async () => {
                      const after = bonusAfter(r.holding.shares, r.holding.avgCost, b.pct);
                      await setHoldings(applyBonus(holdingsAll, r.holding.symbol, b.pct));
                      await appliedBonusesPref.set([...applied, key]);
                      await bonusLogPref.set([
                        ...(await bonusLogPref.get()),
                        {
                          key,
                          symbol: r.holding.symbol,
                          pct: b.pct,
                          day: new Date(b.bookClosure + 5 * 3600_000).toISOString().slice(0, 10),
                          before: { shares: r.holding.shares, avgCost: r.holding.avgCost },
                          after,
                          at: Date.now(),
                          auto: false,
                        },
                      ]);
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
            <Pressable accessibilityRole="link" onPress={() => r.results?.latest?.url && Linking.openURL(r.results.latest.url)} style={styles.results}>
              <T v="body" style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>
                {r.results!.latest?.fresh ? resultsLine(r.results!.latest!) : `Board meeting notice on ${fmtDay(Date.parse(r.results!.meetingNotice!.date + 'T12:00:00Z'))}: results are probably due within days.`}
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
          {open ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setTrading((v) => !v)} style={{ paddingLeft: 16, paddingBottom: 12 }}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>Bought or sold some?</T>
            </Pressable>
          ) : null}
          {trading ? <TradeSheet symbol={r.holding.symbol} price={r.price} onDone={() => setTrading(false)} /> : null}
        </>
      ) : null}
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
  const cash = cashPref.use();
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
  const scroller = useRef<ScrollView>(null);
  const shownTotal = useCountUp(total > 0 ? total : null);
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
        <StarterPlanCard title="New to investing? Start here" />
        <View style={{ gap: 8 }}>
          <T v="caption" style={{ lineHeight: 18 }}>
            Already own shares? Type or paste each holding as symbol, shares and average price. They stay on this phone only.
          </T>
          <Button tone="ghost" label="Add holdings I already have" onPress={() => nav.navigate('EditHoldings')} />
        </View>
      </ScrollView>
    );

  const invested = holdings.reduce((a, h) => a + h.shares * h.avgCost, 0);
  const slices = ringSlices(rows.map((r) => ({ label: r.holding.symbol, value: r.value })));
  const colorOf = (sym: string) => {
    const k = slices.findIndex((x) => x.label === sym);
    return seriesColor(k >= 0 ? k : 5);
  };
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
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroller} contentContainerStyle={[styles.content, view === 'holdings' && { paddingBottom: 100 }]}>
        <Rise style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <AllocationRing slices={slices}>
              <T v="caption" style={{ fontSize: 11 }}>
                {holdings.length} stocks
              </T>
              <T v="mono" style={{ fontSize: 14.5, color: changeColor(pnl) }}>
                {pct(invested ? total / invested - 1 : 0)}
              </T>
            </AllocationRing>
            <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
              <T v="caption">Market value</T>
              <T v="monoLg" style={{ fontSize: 26, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
                {fmtNum(shownTotal ?? total, 0)}
              </T>
              <T v="caption" style={{ lineHeight: 18 }}>
                <T v="mono" style={{ fontSize: 12.5, color: changeColor(pnl) }}>
                  {fmtSigned(pnl, 0)}
                </T>{' '}
                on {fmtNum(invested, 0)} put in
              </T>
              {!loading && income > 0 ? (
                <T v="caption" style={{ lineHeight: 18 }}>
                  Dividends ≈{' '}
                  <T v="mono" style={{ fontSize: 12.5 }}>
                    {fmtNum(netIncome, 0)}
                  </T>{' '}
                  a year after tax
                </T>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 6, columnGap: 14 }}>
            {slices.map((x, i) => (
              <View key={x.label} style={styles.legend}>
                <View style={[styles.swatch, { backgroundColor: seriesColor(i) }]} />
                <T v="caption" style={{ color: colors.text2 }}>
                  {x.label} {Math.round((x.value / (total || 1)) * 100)}%
                </T>
              </View>
            ))}
          </View>
          <CashBox shares={total} />
          {!loading ? (
            <T v="body" style={{ fontSize: 14, color: colors.text2 }}>
              {counts.map(([a, n]) => `${n} ${a.toLowerCase()}`).join(' · ')}
              {watching ? ` (${watching} to watch, the eye on their tag)` : ''}
              {'  '}
              <T accessibilityRole="link" onPress={() => nav.navigate('SellSignals')} style={{ color: colors.gold, fontSize: 14, fontFamily: fonts.semibold }}>
                Warning signs ›
              </T>
            </T>
          ) : (
            <T v="caption">Checking each holding…</T>
          )}
        </Rise>
        {breadth != null && breadth < 0.5 ? (
          <T v="caption" style={{ lineHeight: 18 }}>
            Only {Math.round(breadth * 100)}% of liquid PSX stocks are above their 200-day average, so most chart warnings below reflect the whole market falling, not these companies.
          </T>
        ) : null}

        <Segmented
          options={[
            { key: 'holdings', label: 'Holdings' },
            { key: 'invest', label: 'Invest cash' },
            { key: 'risk', label: 'Returns' },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'holdings' ? (
          <>
            {newTrade ? <TradeSheet onDone={() => setNewTrade(false)} /> : null}

            {!loading && (reported.length || due.length) ? (
              <Panel style={{ paddingVertical: 12, gap: 4 }}>
                <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>Results season</T>
                {reported.length ? <T v="caption">Reported this week: {reported.join(', ')}. Their decisions below already use the new numbers.</T> : null}
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
                  "Buy by" counts two working days back from book closure, as PSX settles a day after the trade, skipping weekends and PSX holidays. Moon-dependent holidays can move, so check the ex-date in your broker
                  app if it's close.
                </T>
              </Section>
            ) : null}

            <Section title="Holdings" action="Edit all" onAction={() => nav.navigate('EditHoldings')}>
              {sorted.map((r, i) => (
                <Rise key={r.holding.symbol} delay={Math.min(i, 8) * 50}>
                  <HoldingCard r={r} color={colorOf(r.holding.symbol)} taxRate={rateOf(r)} applied={applied} holdingsAll={holdings} onOpen={() => nav.navigate('Stock', { symbol: r.holding.symbol })} />
                </Rise>
              ))}
            </Section>
          </>
        ) : null}

        {view === 'invest' ? (
          <>
            {on('summary') ? (
              <Section title="Your goals" action="Monthly summary" onAction={() => nav.navigate('Summary')}>
                <GoalCard value={total + cash.amount} tracked={null} />
              </Section>
            ) : null}
            <Section title="Where should new money go?">{loading ? <T v="caption">Waiting for every holding's review…</T> : <PlanCard rows={rows} breadth={breadth} />}</Section>
            <Section title="Or spread it over new companies">
              <StarterPlanCard title="A fresh spread" />
            </Section>
          </>
        ) : null}

        {view === 'risk' ? (
          <>
            {on('health') ? (
              <>
                <Section title="Health check">{loading ? <T v="caption">Checking every holding…</T> : <HealthCard rows={rows} />}</Section>
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

            {on('zakat') ? <Section title="Zakat on your shares">{loading ? <T v="caption">Waiting for every holding's figures…</T> : <ZakatCard rows={rows} />}</Section> : null}

            {on('health') ? <Section title="Stress test">{loading ? <T v="caption">Waiting for every holding's price history…</T> : <StressCard rows={stressRows} candles={candles} />}</Section> : null}
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
          Review means the business has weakened (losses or falling earnings). Trim means one holding is over 20% of your money, or it is far above fair value with a broken chart. Add more needs a price below fair value,
          an uptrend, and under 10% of your portfolio. A weak chart alone only says watch. A second opinion from fixed rules, not advice.
        </T>
      </ScrollView>
      {view === 'holdings' && !newTrade ? (
        <Press
          accessibilityRole="button"
          accessibilityLabel="Record a trade"
          onPress={() => {
            setNewTrade(true);
            scroller.current?.scrollTo({ y: 0, animated: true });
          }}
          style={styles.fab}
        >
          <ToolIcon name="plus" size={20} color={colors.onGold} />
          <T style={{ fontFamily: fonts.heavy, fontSize: 14.5, color: colors.onGold }}>Record a trade</T>
        </Press>
      ) : null}
    </View>
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
    tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, flexShrink: 1 },
    tagText: { fontFamily: fonts.heavy, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' },
    legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 8, height: 8, borderRadius: 2 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      height: 52,
      paddingLeft: 16,
      paddingRight: 20,
      borderRadius: 26,
      backgroundColor: colors.gold,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }),
);
