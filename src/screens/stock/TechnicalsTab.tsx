import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, space, themed } from '../../theme';
import { fmtDay, fmtNum, fmtPrice } from '../../format';
import type { Analysis } from '../../analysis/signals';
import type { Reading, Technicals } from '../../analysis/technicals';
import { SignalsCard } from '../../ui/SignalsCard';
import { BacktestCard } from '../../ui/BacktestCard';
import type { Backtest } from '../../analysis/backtest';
import { ActionChip, Panel } from '../../ui/bits';
import { Loading, Section, T } from '../../ui/kit';

function ReadingRow({ r, last }: { r: Reading; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontSize: 14.5 }}>
          {r.name} <T v="caption">({r.params})</T>
        </T>
      </View>
      <T v="mono" style={styles.value}>
        {r.value == null ? '—' : fmtNum(r.value, 2)}
      </T>
      <ActionChip action={r.action} wide />
    </View>
  );
}

const PIVOT_ROWS: { key: 'r3' | 'r2' | 'r1' | 'pp' | 's1' | 's2' | 's3'; label: string; sub: string }[] = [
  { key: 'r3', label: 'R3', sub: '3rd resistance' },
  { key: 'r2', label: 'R2', sub: '2nd resistance' },
  { key: 'r1', label: 'R1', sub: '1st resistance' },
  { key: 'pp', label: 'PP', sub: 'Pivot point' },
  { key: 's1', label: 'S1', sub: '1st support' },
  { key: 's2', label: 'S2', sub: '2nd support' },
  { key: 's3', label: 'S3', sub: '3rd support' },
];

export function TechnicalsTab({
  symbol,
  analysis,
  tech,
  backtest,
  loading,
}: {
  symbol: string;
  analysis: Analysis | null;
  tech: Technicals | null;
  backtest: Backtest | null;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!tech) return <T v="caption">Not enough trading history for technical indicators yet.</T>;
  const s = tech.summary;
  const smas = tech.averages.filter((a) => a.name === 'SMA');
  const emas = tech.averages.filter((a) => a.name === 'EMA');

  return (
    <View style={{ gap: space.section }}>
      <Section title="Summary">
        <Panel style={{ paddingVertical: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="caption">{tech.oscillators.length + tech.averages.length} indicators</T>
            <ActionChip action={s.verdict} />
          </View>
          <View style={styles.counts}>
            <View style={{ flex: s.buy || 0.0001, backgroundColor: colors.up }} />
            <View style={{ flex: s.neutral || 0.0001, backgroundColor: colors.line }} />
            <View style={{ flex: s.sell || 0.0001, backgroundColor: colors.down }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption" style={{ color: colors.up }}>
              {s.buy} buy
            </T>
            <T v="caption">{s.neutral} neutral</T>
            <T v="caption" style={{ color: colors.downText }}>
              {s.sell} sell
            </T>
          </View>
        </Panel>
      </Section>

      <SignalsCard analysis={analysis} />

      {backtest ? (
        <Section title="Track record">
          <BacktestCard symbol={symbol} bt={backtest} analysis={analysis} />
        </Section>
      ) : null}

      <Section title="Oscillators">
        <Panel>
          {tech.oscillators.map((r, i) => (
            <ReadingRow key={r.id} r={r} last={i === tech.oscillators.length - 1} />
          ))}
        </Panel>
      </Section>

      <Section title="Moving averages">
        <Panel>
          {smas.map((r, i) => (
            <ReadingRow key={r.id} r={r} last={i === smas.length - 1} />
          ))}
        </Panel>
        <Panel>
          {emas.map((r, i) => (
            <ReadingRow key={r.id} r={r} last={i === emas.length - 1} />
          ))}
        </Panel>
        <T v="caption">Buy when the price is above the average, sell when below.</T>
      </Section>

      {tech.pivots ? (
        <Section title="Pivot points">
          <Panel>
            {PIVOT_ROWS.map((p, i) => {
              const v = tech.pivots![p.key];
              const tone = p.key.startsWith('r') ? colors.downText : p.key.startsWith('s') ? colors.up : colors.text;
              return (
                <View key={p.key} style={[styles.row, i < PIVOT_ROWS.length - 1 && styles.border]}>
                  <T v="body" style={{ width: 36, fontSize: 14.5 }}>
                    {p.label}
                  </T>
                  <T v="caption" style={{ flex: 1, fontSize: 13 }}>
                    {p.sub}
                  </T>
                  <T v="mono" style={[styles.value, { color: tone }]}>
                    {fmtPrice(v)}
                  </T>
                </View>
              );
            })}
          </Panel>
          <T v="caption">Classic pivots for the next session, from the {fmtDay(tech.asOf)} high, low and close.</T>
        </Section>
      ) : null}
      <T v="caption" style={{ lineHeight: 18 }}>
        Indicator readings are mechanical rules, not advice. They often disagree; use them together with the chart and the
        company's results.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    value: { fontSize: 15, minWidth: 72, textAlign: 'right' },
    counts: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  }),
);
