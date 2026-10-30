/** "Why did it move?" on a stock's page: its biggest days this year, each with what PSX shows behind it. */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, space, themed } from '../theme';
import type { Candle, CompanyInfo, SeriesPoint } from '../psx/types';
import { fetchPayouts, fetchSeries } from '../psx/api';
import { cached } from '../psx/cache';
import { exDate, type Payout } from '../analysis/dividends';
import { bigDays, type Reason } from '../analysis/whyMoved';
import { Panel } from './bits';
import { Section, T } from './kit';
import { ToolIcon } from './ToolIcon';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const GLYPH: Record<Reason['kind'], string> = { notice: 'doc', market: 'line', exdate: 'coins', volume: 'bars', none: 'question' };

export function WhyMovedCard({ symbol, daily, company }: { symbol: string; daily: Candle[] | null; company: CompanyInfo | null }) {
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    cached<SeriesPoint[]>('eod:KSE100', 30 * 60_000, () => fetchSeries('eod', 'KSE100'), { persist: true })
      .then(setIndex)
      .catch(() => setIndex([]));
    cached(`payouts:${symbol}`, 6 * 3600_000, () => fetchPayouts(symbol), { persist: true })
      .then(setPayouts)
      .catch(() => setPayouts([]));
  }, [symbol]);
  const days = useMemo(() => {
    if (!daily || daily.length < 30) return null;
    const exDays = (payouts ?? [])
      .filter((p) => p.bookClosure && p.items.some((i) => i.type === 'D'))
      .map((p) => {
        const pct = p.items.filter((i) => i.type === 'D').reduce((s, i) => s + i.pct, 0);
        return { day: pkDay(exDate(p.bookClosure!)), what: `a ${pct}% dividend` };
      });
    return bigDays(daily, { announcements: company?.announcements ?? [], index: index ?? [], exDays });
  }, [daily, payouts, index, company]);
  if (!days?.length) return null;
  const shown = all ? days : days.slice(0, 3);
  return (
    <View style={{ paddingHorizontal: space.gutter }}>
      <Section title="Why did it move?">
        <Panel style={{ paddingVertical: 4 }}>
          {shown.map((d, i) => {
            const up = d.pct >= 0;
            return (
              <View key={d.day} style={[styles.day, i < shown.length - 1 && styles.border]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{nice(d.day)}</T>
                  <View style={[styles.pill, { backgroundColor: up ? colors.upSoft : colors.downSoft }]}>
                    <T v="mono" style={{ fontSize: 13, color: up ? colors.up : colors.downText }}>
                      {up ? '+' : '−'}
                      {Math.abs(d.pct * 100).toFixed(1)}%
                    </T>
                  </View>
                </View>
                {d.reasons.map((r, k) => (
                  <Pressable key={k} disabled={!r.url} accessibilityRole={r.url ? 'link' : undefined} onPress={() => r.url && Linking.openURL(r.url).catch(() => {})} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ paddingTop: 1 }}>
                      <ToolIcon name={GLYPH[r.kind]} size={15} color={r.kind === 'none' ? colors.faint : colors.gold} />
                    </View>
                    <T v="caption" style={{ flex: 1, lineHeight: 17, color: r.kind === 'none' ? colors.muted : colors.text2 }} numberOfLines={3}>
                      {r.text}
                      {r.url ? <T v="caption" style={{ color: colors.gold }}> Open ›</T> : null}
                    </T>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {days.length > 3 ? (
            <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={{ paddingVertical: 12 }}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.gold }}>{all ? 'Show fewer' : `Show all ${days.length} big days`}</T>
            </Pressable>
          ) : null}
        </Panel>
        <T v="caption" style={{ lineHeight: 17 }}>
          Moves of 4% or more in the last year, with the company's notices, the market and trading that day. PSX shows notices for recent months only; news beyond that isn't matched.
        </T>
      </Section>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    day: { paddingVertical: 12, gap: 7 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    pill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  }),
);
