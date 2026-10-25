/** Market mood: a 0–100 fear/greed gauge from the daily job, with what followed each mood in the past. */
import React, { useState } from 'react';
import { useFlag } from '../flags';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import { isMoodFeed, MOOD_PARTS, moodLabel, PART_LABEL, type MoodFeed } from '../analysis/mood';
import { useFeedFile } from '../picks/feed';
import { T } from './kit';

export const moodColor = (s: number) => (s < 25 ? colors.down : s < 45 ? colors.downText : s <= 55 ? colors.gold : s <= 75 ? colors.up : colors.up);

export function useMood() {
  return useFeedFile<MoodFeed>('mood.json', isMoodFeed);
}

const dayT = (d: string) => Date.parse(d + 'T12:00:00Z');

/** The score n sessions before the latest one. */
const ago = (f: MoodFeed, n: number) => (f.history.length > n ? f.history[f.history.length - 1 - n][1] : null);

function Gauge({ score }: { score: number }) {
  return (
    <View style={{ height: 14, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
        {[colors.down, colors.downText, colors.gold, colors.up, colors.up].map((c, i) => (
          <View key={i} style={{ flex: [25, 20, 11, 20, 24][i], backgroundColor: c, opacity: i === 4 ? 1 : 0.55 + i * 0.05 }} />
        ))}
      </View>
      <View style={[styles.marker, { left: `${Math.max(1, Math.min(99, score))}%` }]} />
    </View>
  );
}

function History({ f, width = 300, height = 60 }: { f: MoodFeed; width?: number; height?: number }) {
  const h = f.history.slice(-260);
  if (h.length < 10) return null;
  const x = (i: number) => (i / (h.length - 1)) * width;
  const y = (s: number) => 2 + ((100 - s) / 100) * (height - 4);
  const d = h.map(([, s], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s).toFixed(1)}`).join('');
  return (
    <View style={{ gap: 4 }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Path d={`M0 ${y(50)}L${width} ${y(50)}`} stroke={colors.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={d} stroke={colors.gold} strokeWidth={1.6} fill="none" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption">{fmtDay(dayT(h[0][0]))}</T>
        <T v="caption">Fear below the line, greed above</T>
        <T v="caption">{fmtDay(dayT(h[h.length - 1][0]))}</T>
      </View>
    </View>
  );
}

export function MoodCard() {
  const enabled = useFlag('mood');
  const { data: f } = useMood();
  const [open, setOpen] = useState(false);
  if (!f || !enabled) return null;
  const s = f.now.score;
  const week = ago(f, 5);
  const month = ago(f, 21);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Market mood ${s}, ${moodLabel(s)}`} onPress={() => setOpen((v) => !v)} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text2 }}>Market mood</T>
        <T v="caption">{open ? 'Less ▴' : 'Why? ▾'}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <T v="monoLg" style={{ fontSize: 30, color: moodColor(s) }}>
          {s}
        </T>
        <T style={{ fontFamily: fonts.heavy, fontSize: 17, color: moodColor(s) }}>{moodLabel(s)}</T>
      </View>
      <Gauge score={s} />
      <T v="caption">
        {week != null ? `A week ago ${week}` : ''}
        {month != null ? ` · a month ago ${month}` : ''} · 0 is extreme fear, 100 extreme greed
      </T>
      {open ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <View style={{ gap: 7 }}>
            {MOOD_PARTS.map((k, i) => {
              const v = f.now.parts[i];
              return (
                <View key={k} style={{ gap: 3 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="caption" style={{ color: colors.text2 }}>
                      {PART_LABEL[k]}
                    </T>
                    <T v="caption" style={{ color: v == null ? colors.faint : moodColor(v), fontFamily: fonts.bold }}>
                      {v == null ? '–' : v}
                    </T>
                  </View>
                  <View style={styles.track}>
                    <View style={{ width: `${v ?? 0}%`, height: 4, borderRadius: 2, backgroundColor: v == null ? colors.faint : moodColor(v) }} />
                  </View>
                </View>
              );
            })}
          </View>
          <History f={f} />
          {f.outcomes.length ? (
            <View style={{ gap: 6 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 13.5 }}>What the KSE-100 did in the 6 months after</T>
              {f.outcomes.map((o) => (
                <View key={o.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <T v="body" style={{ flex: 1, fontSize: 13.5 }}>
                    {o.label}
                  </T>
                  <T v="mono" style={{ width: 70, textAlign: 'right', fontSize: 13.5, color: o.avg >= 0 ? colors.up : colors.downText }}>
                    {o.avg >= 0 ? '+' : ''}
                    {(o.avg * 100).toFixed(0)}%
                  </T>
                  <T v="caption" style={{ width: 96, textAlign: 'right' }}>
                    up {Math.round(o.upShare * 100)}% of {o.days}d
                  </T>
                </View>
              ))}
              <T v="caption" style={{ lineHeight: 18 }}>
                Average change in the six months after each day with that mood, since {fmtDay(dayT(f.since ?? f.history[0][0]))}.
                {f.outcomes.every((o) => o.avg > 0) ? ' The market mostly rose over this time, so every mood was followed by gains on average.' : ''} A
                pattern from the past, not a forecast.
              </T>
            </View>
          ) : null}
          <T v="caption" style={{ lineHeight: 18 }}>
            Each reading is ranked against the PSX's own last three years (50 = a typical day), and the score is their average.
            Updated after each close.
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.hairline },
    marker: { position: 'absolute', width: 4, height: 14, marginLeft: -2, borderRadius: 2, backgroundColor: colors.text, borderWidth: 1, borderColor: colors.surface },
    track: { height: 4, borderRadius: 2, backgroundColor: colors.surface2 },
  }),
);
