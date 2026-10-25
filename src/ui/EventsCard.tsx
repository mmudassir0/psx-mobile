/** "Coming up": the next two weeks' days when bigger moves are likely, for the market and your holdings. */
import React, { useMemo, useState } from 'react';
import { useFlag } from '../flags';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts, space, themed } from '../theme';
import { fmtNum } from '../format';
import { holidayEvents, rateEvents, type MarketEvent } from '../analysis/events';
import { currentRights, exDate, upcomingPayout } from '../analysis/dividends';
import type { Row } from '../portfolio/useReviews';
import { Panel } from './bits';
import { Section, T } from './kit';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: string, today: string) => {
  const t = new Date(d + 'T12:00:00Z');
  const tomorrow = pkDay(Date.parse(today + 'T12:00:00Z') + 864e5 - 5 * 3600_000);
  const name = d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : WD[t.getUTCDay()];
  return `${name} ${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
};
const ICON: Record<MarketEvent['kind'], string> = { rates: '🏦', results: '📊', exdate: '💸', bookclosure: '📕', rights: '🧾', holiday: '🚫' };

export function eventsFor(rows: Row[], now = Date.now(), days = 14): MarketEvent[] {
  const out: MarketEvent[] = [...rateEvents(now, days), ...holidayEvents(now, days)];
  const to = pkDay(now + days * 864e5);
  const today = pkDay(now);
  for (const r of rows) {
    const sym = r.holding.symbol;
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
          detail: `The price usually drops by ${drop} at the open. Not a loss: you keep the payout${up.dps > 0 ? `, about Rs ${fmtNum(up.dps * r.holding.shares, 0)} before tax on your shares` : ''}.`,
        });
      }
    }
    const ri = currentRights(r.dividends, now);
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
  const list = useMemo(() => eventsFor(rows, now), [rows, now]);
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
                <T style={{ fontSize: 17, width: 26 }}>{ICON[e.kind]}</T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{e.title}</T>
                  <T v="caption">{e.kind === 'results' ? 'Any day now' : label(e.day, today)}</T>
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
