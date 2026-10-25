/** Home: a short AI-written note on your holdings' week, written once the week's trading is over (or on request). */
import React, { useEffect, useRef, useState } from 'react';
import { useFlag } from '../flags';
import { Pressable, View } from 'react-native';
import { colors, fonts, space } from '../theme';
import type { Candle, SeriesPoint } from '../psx/types';
import { cached } from '../psx/cache';
import { fetchSeries } from '../psx/api';
import { useAi } from '../store/ai';
import type { Row } from '../portfolio/useReviews';
import { briefMessages, briefPref, weekOf, weekOver, weeklyFacts } from '../portfolio/weekly';
import { useMood } from './MoodCard';
import { useNews } from './NewsList';
import { Panel } from './bits';
import { Section, T } from './kit';

export function WeeklyBriefCard({ rows, candles, breadth, ready }: { rows: Row[]; candles: Record<string, Candle[] | null>; breadth: number | null; ready: boolean }) {
  const briefOn = useFlag('brief');
  const aiOn = useFlag('ai');
  const enabled = briefOn && aiOn;
  const ai = useAi();
  const brief = briefPref.use();
  const { data: mood } = useMood();
  const { items: news } = useNews();
  const [writing, setWriting] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);
  const week = weekOf();
  const current = brief?.week === week ? brief : null;

  const write = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setWriting('');
    try {
      const idx = await cached<SeriesPoint[]>('eod:KSE100', 30 * 60_000, () => fetchSeries('eod', 'KSE100'), { persist: true }).catch(() => null);
      const indexWeek = idx && idx.length > 6 ? idx[idx.length - 1].v / idx[idx.length - 6].v - 1 : null;
      const facts = weeklyFacts(rows, candles, { mood: mood?.now.score ?? null, indexWeek, breadth, news });
      let text = '';
      const run = await ai.run(() => briefMessages(facts), (t) => {
        text += t;
        setWriting(text);
      }, 450);
      await run.gen.done;
      if (text.trim()) await briefPref.set({ week, text: text.trim(), engine: run.engine(), at: Date.now() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setWriting('');
    }
  };

  // once the week's trading is over, write it the first time Home opens with everything loaded
  useEffect(() => {
    if (!enabled || !ready || current || tried.current || !weekOver() || !ai.available || !rows.length) return;
    tried.current = true;
    write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, ai.available, rows.length]);

  if (!rows.length || !enabled) return null;
  const shown = writing || current?.text || '';
  return (
    <View style={{ paddingHorizontal: space.gutter }}>
      <Section title="This week" action={current && !busy ? 'Write again' : undefined} onAction={write}>
        <Panel style={{ paddingVertical: 14, gap: 8 }}>
          {shown ? (
            <T v="body" style={{ fontSize: 14, lineHeight: 21, color: colors.text2 }}>
              {shown}
            </T>
          ) : !ai.available ? (
            <T v="caption" style={{ lineHeight: 18 }}>
              Add a Gemini or Groq key in Settings → AI and Sahm writes a short note on your holdings every Friday after the close.
            </T>
          ) : (
            <Pressable accessibilityRole="button" onPress={write} hitSlop={8} disabled={busy || !ready}>
              <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: ready ? colors.gold : colors.muted }}>
                {busy ? 'Writing…' : weekOver() ? "Write this week's brief" : 'Write a brief of the week so far'}
              </T>
            </Pressable>
          )}
          {err ? (
            <T v="caption" style={{ color: colors.downText }}>
              {err}
            </T>
          ) : null}
          {current && !writing ? (
            <T v="caption">
              Written by {current.engine} from your holdings' figures; it can still get things wrong, so check anything important.
            </T>
          ) : null}
        </Panel>
      </Section>
    </View>
  );
}
