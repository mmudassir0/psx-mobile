/** Index trend (up, down, sideways), levels and returns, with an AI explanation. */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDateTime, fmtDay } from '../format';
import { IndexTrend, Regime, trendTriggers } from '../analysis/market';
import { useAi } from '../store/ai';
import type { Generation } from '../ai/models';
import { load, save } from '../storage';
import { Md } from './Md';
import { marketMessages } from '../ai/marketContext';
import { ModelCard } from './ModelCard';
import { Panel } from './bits';
import { Button, T } from './kit';

const tone = (r: Regime): [string, string] => (r === 'Uptrend' ? [colors.up, colors.upSoft] : r === 'Downtrend' ? [colors.downText, colors.downSoft] : [colors.text, colors.surface2]);
const f0 = (v: number | null) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const pc = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);

function Ret({ label, v }: { label: string; v: number | null }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T v="caption">{label}</T>
      <T v="mono" style={{ fontSize: 14, color: v == null ? colors.muted : v >= 0 ? colors.up : colors.downText }}>
        {pc(v)}
      </T>
    </View>
  );
}

export function IndexTrendCard({ t }: { t: IndexTrend }) {
  const [fg, bg] = tone(t.regime);
  const tr = trendTriggers(t);
  return (
    <Panel style={{ paddingVertical: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.chip, { backgroundColor: bg }]}>
          <T style={{ fontFamily: fonts.heavy, fontSize: 16, color: fg }}>{t.regime}</T>
        </View>
        <T v="body" style={{ flex: 1, fontSize: 14 }}>
          for {t.days} trading days, since {fmtDay(t.since)}
        </T>
      </View>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <T v="caption">50-day average</T>
          <T v="mono">{f0(t.ma50)}</T>
        </View>
        <View style={styles.cell}>
          <T v="caption">200-day average</T>
          <T v="mono">{f0(t.ma200)}</T>
        </View>
        <View style={styles.cell}>
          <T v="caption">Support</T>
          <T v="mono" style={{ color: colors.up }}>
            {f0(t.support)}
          </T>
        </View>
        <View style={styles.cell}>
          <T v="caption">Resistance</T>
          <T v="mono" style={{ color: colors.downText }}>
            {f0(t.resistance)}
          </T>
        </View>
        <View style={styles.cell}>
          <T v="caption">60-day range</T>
          <T v="mono">
            {f0(t.rangeLow)}–{f0(t.rangeHigh)}
          </T>
        </View>
        <View style={styles.cell}>
          <T v="caption">From 52-week high</T>
          <T v="mono" style={{ color: t.fromHigh < -0.1 ? colors.downText : colors.text }}>
            {pc(t.fromHigh)}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Ret label="1W" v={t.returns.w1} />
        <Ret label="1M" v={t.returns.m1} />
        <Ret label="3M" v={t.returns.m3} />
        <Ret label="YTD" v={t.returns.ytd} />
        <Ret label="1Y" v={t.returns.y1} />
      </View>
      <View style={{ gap: 4 }}>
        <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
          ▲ {tr.up}
        </T>
        <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
          ▼ {tr.down}
        </T>
      </View>
      <T v="caption" style={{ lineHeight: 18 }}>
        Uptrend: above the 50-day average, which is above a rising 200-day. Downtrend: the opposite. Anything else is sideways. A change needs 5 days in a row to count.
      </T>
    </Panel>
  );
}

interface Saved {
  day: string;
  at: number;
  model: string;
  text: string;
}
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Runs the AI on a market context and keeps today's answer. */
export function MarketAi({ id, context }: { id: string; context: string }) {
  const ai = useAi();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<Generation | null>(null);
  const key = `ai.market.${id}`;
  useEffect(() => {
    load<Saved | null>(key, null).then((s) => s && s.day === today() && setSaved(s));
    return () => handle.current?.stop();
  }, [key]);
  const run = async () => {
    setError(null);
    setText('');
    setSaved(null);
    setRunning(true);
    try {
      const r = await ai.run(() => marketMessages(context), setText, 450);
      handle.current = r.gen;
      const out = await r.gen.done;
      if (out.trim()) {
        const s = { day: today(), at: Date.now(), model: r.engine(), text: out };
        setSaved(s);
        save(key, s);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      handle.current = null;
    }
  };
  const shown = running ? text : (saved?.text ?? text);
  return (
    <>
      {!ai.available ? <ModelCard /> : null}
      <Panel style={{ paddingVertical: 16, gap: 12 }}>
        {shown ? (
          <Md text={shown + (running ? ' ▍' : '')} />
        ) : (
          <T v="body" style={{ color: colors.text2 }}>
            The AI reads the trend, levels, breadth and sector moves above and explains what they mean for you.
          </T>
        )}
        {running && !text ? <T v="caption">Reading the market…</T> : null}
        {error ? (
          <T v="caption" style={{ color: colors.downText }}>
            Stopped: {error}
          </T>
        ) : null}
        {saved && !running ? (
          <T v="caption">
            Written {fmtDateTime(saved.at)} by {saved.model}
          </T>
        ) : null}
        {running ? (
          <Button label="Stop" tone="ghost" onPress={() => handle.current?.stop()} />
        ) : (
          <Button label={saved ? 'Explain again' : 'Explain the market with AI'} onPress={run} disabled={!ai.available || !context} />
        )}
      </Panel>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline, paddingVertical: 12 },
    cell: { width: '50%', gap: 2 },
  }),
);
