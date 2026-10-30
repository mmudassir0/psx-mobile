/** "Coming up": the next two weeks' days when bigger moves are likely, for the market and your holdings. */
import React, { useEffect, useMemo, useState } from 'react';
import { useFlag } from '../flags';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { holidayEvents, rateEvents, type MarketEvent } from '../analysis/events';
import { currentRights, dividends, exDate, upcomingPayout } from '../analysis/dividends';
import { useUser } from '../store/user';
import { cached, COMPANY_TTL } from '../psx/cache';
import { fetchCompany, fetchPayouts } from '../psx/api';
import { fiscalEndMonth } from '../analysis/fairValue';
import { resultsStatus } from '../analysis/results';
import { eachLimit } from '../limit';
import type { Row } from '../portfolio/useReviews';
import { Panel } from './bits';
import { Section, T } from './kit';
import { EVENT_GLYPH, ToolIcon } from './ToolIcon';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: string, today: string) => {
  const t = new Date(d + 'T12:00:00Z');
  const tomorrow = pkDay(Date.parse(today + 'T12:00:00Z') + 864e5 - 5 * 3600_000);
  const name = d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : WD[t.getUTCDay()];
  return `${name} ${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
};

/**
 * Your watchlist as rows with no shares (dividends and results only), so its ex-dates and results
 * show in Coming up and Today too. Up to 15 stocks you don't hold, read from the shared cache.
 */
export function useWatchRows(held: Row[]): Row[] {
  const { watchlist } = useUser();
  const heldSet = useMemo(() => new Set(held.map((r) => r.holding.symbol)), [held]);
  const want = useMemo(() => watchlist.filter((s) => !heldSet.has(s)).slice(0, 15), [watchlist, heldSet]);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Row[] = [];
      await eachLimit(want, 2, async (symbol) => {
        const [company, payouts] = await Promise.all([
          cached(`company:${symbol}`, COMPANY_TTL, () => fetchCompany(symbol), { persist: true }).catch(() => null),
          cached(`payouts:${symbol}`, 6 * 3600_000, () => fetchPayouts(symbol), { persist: true }).catch(() => null),
        ]);
        const price = company?.close ?? 0;
        out.push({
          holding: { symbol, shares: 0, avgCost: 0 },
          price,
          value: 0,
          weight: 0,
          review: null,
          fund: false,
          dividends: payouts ? dividends(payouts, { price, divYield: null, fiscalEndMonth: fiscalEndMonth(company?.fiscalYearEnd), latestFiscalYear: company?.financialsAnnual?.periods[0] ?? null }) : null,
          results: company ? resultsStatus(company) : null,
        });
      }, () => alive);
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, [want.join()]);
  return rows;
}

export function eventsFor(rows: Row[], now = Date.now(), days = 14): MarketEvent[] {
  const out: MarketEvent[] = [...rateEvents(now, days), ...holidayEvents(now, days)];
  const to = pkDay(now + days * 864e5);
  const today = pkDay(now);
  for (const r of rows) {
    const sym = r.holding.symbol;
    // a watchlist stock comes in as a row with no shares
    const watch = !(r.holding.shares > 0);
    const up = upcomingPayout(r.dividends, now);
    if (up) {
      const ex = pkDay(exDate(up.bookClosure));
      if (ex >= today && ex <= to) {
        const drop = up.dps > 0 ? `about Rs ${up.dps.toFixed(2)} a share (the dividend)` : 'about the bonus';
        out.push({
          day: ex,
          kind: 'exdate',
          symbol: sym,
          title: `${sym} goes ex-${up.dps > 0 ? 'dividend' : 'bonus'}`,
          detail: watch
            ? `To get the ${up.dps > 0 ? `Rs ${up.dps.toFixed(2)} a share dividend` : 'bonus shares'}, the shares must be bought by the trading day before. From this day the price usually drops by ${drop} at the open.`
            : `The price usually drops by ${drop} at the open. Not a loss: you keep the payout${up.dps > 0 ? `, about Rs ${fmtNum(up.dps * r.holding.shares, 0)} before tax on your shares` : ''}.`,
          ...(watch ? { watch } : {}),
        });
      }
    }
    const ri = watch ? null : currentRights(r.dividends, now);
    if (ri && ri.phase === 'before') {
      const d = pkDay(ri.lastBuyDay);
      if (d >= today && d <= to)
        out.push({
          day: d,
          kind: 'rights',
          symbol: sym,
          title: `${sym} rights: last day to qualify`,
          detail: `A ${ri.pct}% rights issue: holding the shares at the end of this day gets you the offer of ${fmtNum(Math.floor((r.holding.shares * ri.pct) / 100), 0)} new shares. The holding card works out the cost once you enter the offer price.`,
        });
    }
    if (r.results && !r.results.latest?.fresh && r.results.meetingNotice) {
      out.push({
        day: today,
        kind: 'results',
        symbol: sym,
        title: `${sym} results due soon`,
        detail: `Board meeting called on ${r.results.meetingNotice.date}. Prices often move most on the day results come out.`,
        ...(watch ? { watch } : {}),
      });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === 'rates' ? -1 : 1));
}

export function EventsCard({ rows, padded }: { rows: Row[]; padded?: boolean }) {
  const enabled = useFlag('comingUp');
  const nav = useNavigation();
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();
  const today = pkDay(now);
  const watchRows = useWatchRows(rows);
  const list = useMemo(() => eventsFor([...rows, ...watchRows], now), [rows, watchRows, now]);
  if (!list.length || !enabled) return null;
  return (
    <View style={padded ? { paddingHorizontal: space.gutter } : undefined}>
      <Section title="Coming up">
        <Panel style={{ paddingVertical: 4 }}>
          {list.slice(0, 6).map((e, i) => {
            const key = `${e.kind}${e.symbol ?? ''}${e.day}`;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => setOpen((k) => (k === key ? null : key))}
                onLongPress={() => e.symbol && nav.navigate('Stock', { symbol: e.symbol })}
                style={[styles.row, i < Math.min(list.length, 6) - 1 && styles.border]}
              >
                <View style={{ width: 26 }}>
                  <ToolIcon name={EVENT_GLYPH[e.kind] ?? 'calendar'} size={19} color={e.kind === 'holiday' ? colors.muted : colors.gold} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{e.title}</T>
                  <T v="caption">
                    {e.kind === 'results' ? 'Any day now' : label(e.day, today)}
                    {e.watch ? ' · on your watchlist' : ''}
                  </T>
                  {open === key ? (
                    <>
                      <T v="caption" style={{ lineHeight: 18, color: colors.text2, marginTop: 2 }}>
                        {e.detail}
                      </T>
                      {e.symbol ? (
                        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => nav.navigate('Stock', { symbol: e.symbol! })}>
                          <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold, marginTop: 4 }}>Open {e.symbol} ›</T>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
                <T style={{ color: colors.faint }}>{open === key ? '▴' : '▾'}</T>
              </Pressable>
            );
          })}
        </Panel>
        <T v="caption">Days when prices tend to move more (or the market is shut), not which way. Tap one for why.</T>
      </Section>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  }),
);
