import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay, fmtPrice } from '../format';
import type { Analysis, Stance } from '../analysis/signals';
import { Section, T } from './kit';

const stanceColor = (s: Stance): string => (s === 'Strong bullish' || s === 'Bullish' ? colors.up : s === 'Neutral' ? colors.muted : colors.downText);

const VOTE_GLYPH = { '1': '▲', '0': '•', '-1': '▼' } as const;
const voteColor = (v: number) => (v > 0 ? colors.up : v < 0 ? colors.downText : colors.faint);

function Level({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 15 }}>
        {value}
      </T>
      {sub ? (
        <T v="caption" style={{ fontSize: 11.5 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

/** Technical score, the reasons behind it, and key price levels for one stock. */
export function SignalsCard({ analysis, loading }: { analysis: Analysis | null; loading?: boolean }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <Section title="Signals">
        <T v="caption">Reading price history…</T>
      </Section>
    );
  }
  if (!analysis) {
    return (
      <Section title="Signals">
        <T v="caption">Not enough trading history for technical signals yet.</T>
      </Section>
    );
  }

  const a = analysis;
  const tint = stanceColor(a.stance);
  // strongest evidence first: weighted, non-neutral votes on top
  const ranked = [...a.rules].sort((x, y) => Math.abs(y.vote) * y.weight - Math.abs(x.vote) * x.weight);
  const shown = open ? ranked : ranked.slice(0, 4);
  const bulls = a.rules.filter((r) => r.vote > 0).length;
  const bears = a.rules.filter((r) => r.vote < 0).length;
  const close = a.ind.close;
  const away = (p: number) => `${(((p - close) / close) * 100).toFixed(1)}% away`;

  return (
    <Section title="Signals" action={a.rules.length > 4 ? (open ? 'Show fewer' : 'Show all') : undefined} onAction={() => setOpen((v) => !v)}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <T v="caption">Technical view</T>
            <T style={{ fontFamily: fonts.heavy, fontSize: 22, color: tint }}>{a.stance}</T>
          </View>
          <T v="mono" style={{ fontSize: 15, color: colors.text2 }}>
            <T v="mono" style={{ fontSize: 22, color: colors.text }}>
              {a.score.toFixed(1)}
            </T>
            /10
          </T>
        </View>

        <View accessibilityLabel={`Score ${a.score.toFixed(1)} out of 10`}>
          <View style={styles.track}>
            <View style={[styles.zone, { flex: 2.5, backgroundColor: colors.downSoft }]} />
            <View style={[styles.zone, { flex: 1.5, backgroundColor: colors.downSoft, opacity: 0.5 }]} />
            <View style={[styles.zone, { flex: 2, backgroundColor: colors.surface2 }]} />
            <View style={[styles.zone, { flex: 1.5, backgroundColor: colors.upSoft, opacity: 0.5 }]} />
            <View style={[styles.zone, { flex: 2.5, backgroundColor: colors.upSoft }]} />
          </View>
          <View style={[styles.marker, { left: `${a.score * 10}%`, backgroundColor: tint }]} />
        </View>
        <T v="caption">
          {bulls} bullish, {bears} bearish, {a.rules.length - bulls - bears} neutral of {a.rules.length} checks
        </T>

        <View style={{ gap: 10, marginTop: 4 }}>
          {shown.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: 10 }}>
              <T style={{ color: voteColor(r.vote), fontSize: 12, lineHeight: 20, width: 12 }}>{VOTE_GLYPH[String(r.vote) as '1' | '0' | '-1']}</T>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                  {r.reason}
                </T>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.levels}>
          <Level label="Support" value={a.support ? fmtPrice(a.support.price) : '—'} sub={a.support ? away(a.support.price) : undefined} />
          <Level label="Resistance" value={a.resistance ? fmtPrice(a.resistance.price) : '—'} sub={a.resistance ? away(a.resistance.price) : undefined} />
          <Level label="Stop (2× ATR)" value={a.stop != null ? fmtPrice(a.stop) : '—'} sub={a.stop != null ? away(a.stop) : undefined} />
        </View>
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        From daily closes to {fmtDay(a.asOf)}
        {a.bars < 200 ? '; under 200 days of history, so long-term trend checks are skipped' : ''}. Technical signals are probabilities, not advice.
      </T>
    </Section>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
    track: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
    zone: { height: 8 },
    marker: { position: 'absolute', top: -4, width: 4, height: 16, borderRadius: 2, marginLeft: -2 },
    levels: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12, marginTop: 4 },
  }),
);
