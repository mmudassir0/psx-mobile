/** How the technical score and each rule have done on this stock's own past prices. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import type { Backtest, Group, Outcome } from '../analysis/backtest';
import type { Analysis } from '../analysis/signals';
import { groupOf, recordText, trackRecord } from '../analysis/backtest';
import { Panel } from './bits';
import { T } from './kit';

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const ROWS: { key: Group | 'all'; label: string }[] = [
  { key: 'bullish', label: 'Bullish' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'bearish', label: 'Bearish' },
  { key: 'all', label: 'All days' },
];

function Row({ label, o, base, now, last }: { label: string; o: Outcome; base: Outcome; now?: boolean; last?: boolean }) {
  const tone = label === 'All days' ? colors.text : o.avg > base.avg + 0.005 ? colors.up : o.avg < base.avg - 0.005 ? colors.downText : colors.text;
  return (
    <View style={[styles.row, !last && styles.border]}>
      <T v="body" numberOfLines={1} style={{ flex: 1.4, fontSize: 14, fontFamily: now ? fonts.bold : fonts.regular }}>
        {now ? <T style={{ color: colors.gold, fontSize: 14 }}>● </T> : null}
        {label}
      </T>
      <T v="mono" style={styles.cell}>
        {o.days}
      </T>
      <T v="mono" style={styles.cell}>
        {(o.up * 100).toFixed(0)}%
      </T>
      <T v="mono" style={[styles.cell, { color: tone }]}>
        {pct(o.avg)}
      </T>
    </View>
  );
}

export function BacktestCard({ symbol, bt, analysis }: { symbol: string; bt: Backtest; analysis: Analysis | null }) {
  const base = bt.base[10];
  const now = analysis ? groupOf(analysis.stance) : null;
  const rec = analysis ? trackRecord(bt, analysis.stance) : null;
  const rt = rec ? recordText(rec, symbol) : null;
  const rules = bt.rules
    .filter((r) => r.bull.days >= 40 && r.bear.days >= 40)
    .map((r) => ({ name: r.name, edge: r.bull.avg - r.bear.avg }))
    .sort((a, b) => b.edge - a.edge);
  const since = new Date(bt.from).getUTCFullYear();
  return (
    <Panel style={{ paddingVertical: 16, gap: 12 }}>
      <T v="caption" style={{ lineHeight: 18 }}>
        Sahm's technical score replayed on every trading day since {since}, using only the prices known that day. What happened over the next 10 trading days (● is today's reading):
      </T>
      <View>
        <View style={[styles.row, styles.border]}>
          <T v="caption" style={{ flex: 1.4 }}>
            Reading
          </T>
          <T v="caption" style={styles.cell}>
            Days
          </T>
          <T v="caption" style={styles.cell}>
            Rose
          </T>
          <T v="caption" style={styles.cell}>
            Avg move
          </T>
        </View>
        {ROWS.map((r, i) => (
          <Row key={r.key} label={r.label} o={r.key === 'all' ? base : bt.groups[r.key][10]} base={base} now={r.key === now} last={i === ROWS.length - 1} />
        ))}
      </View>
      {rt && rec ? (
        <T v="body" style={{ fontSize: 14, lineHeight: 20, color: rec.edge === 'better' && rec.group !== 'neutral' ? colors.up : rec.edge === 'worse' ? colors.downText : colors.text2 }}>
          {rt.judgement}
        </T>
      ) : null}
      {rules.length ? (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12 }}>
          <T v="caption" style={{ lineHeight: 18 }}>
            Each rule on {symbol}: average 10-day move when it said bullish minus when it said bearish. Positive means the rule has pointed the right way here.
          </T>
          {rules.map((r) => (
            <View key={r.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="body" style={{ fontSize: 14 }}>
                {r.name}
              </T>
              <T v="mono" style={{ fontSize: 14, color: r.edge > 0.002 ? colors.up : r.edge < -0.002 ? colors.downText : colors.muted }}>
                {r.edge >= 0 ? '+' : ''}
                {(r.edge * 100).toFixed(1)} pts
              </T>
            </View>
          ))}
        </View>
      ) : null}
      <T v="caption" style={{ lineHeight: 18 }}>
        Past results don't guarantee future ones. Trading costs and fundamentals are not included.
      </T>
    </Panel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 6 },
    border: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    cell: { flex: 1, textAlign: 'right', fontSize: 14 },
  }),
);
