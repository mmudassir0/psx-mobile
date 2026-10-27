/** Extra sections on a lab result: every start date, against your real portfolio, and the PDF report. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { changeColor, colors, fonts } from '../theme';
import type { Lab } from '../lab/data';
import { runBacktest, type Result, type Strategy } from '../lab/engine';
import { rollOne, rollStarts, summariseRolling, type RollRow } from '../lab/rolling';
import { labReportHtml } from '../lab/report';
import { snapshots, trackReturns } from '../portfolio/track';
import { logProblem } from '../log';
import { Panel } from './bits';
import { Button, Section, Segmented, T } from './kit';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;

function Bars({ rows }: { rows: RollRow[] }) {
  const [w, setW] = useState(320);
  const H = 120;
  const vals = rows.map((r) => r.cagr - r.bench);
  const lo = Math.min(0, ...vals),
    hi = Math.max(0, ...vals);
  const Y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
  const bw = w / Math.max(1, rows.length);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.max(200, e.nativeEvent.layout.width))}>
      <Svg width={w} height={H}>
        {vals.map((v, k) => (
          <Rect key={k} x={k * bw + 0.5} width={Math.max(1, bw - 1)} y={Math.min(Y(v), Y(0))} height={Math.max(1, Math.abs(Y(v) - Y(0)))} fill={v >= 0 ? colors.up : colors.down} opacity={0.85} />
        ))}
        <Line x1={0} x2={w} y1={Y(0)} y2={Y(0)} stroke={colors.muted} strokeWidth={1} />
      </Svg>
    </View>
  );
}

export function RollingSection({ lab, st }: { lab: Lab; st: Strategy }) {
  const [years, setYears] = useState<'1' | '3' | '5'>('3');
  const [rows, setRows] = useState<RollRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setRows(null), [years, st]);
  const starts = useMemo(() => rollStarts(lab, Number(years), 1), [lab, years]);
  const run = async () => {
    const out: RollRow[] = [];
    for (let k = 0; k < starts.length; k++) {
      if (!alive.current) return;
      out.push(rollOne(lab, st, starts[k], Number(years)));
      if (k % 3 === 2) {
        setBusy(k + 1);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    setBusy(null);
    setRows(out);
  };
  const sum = rows ? summariseRolling(rows, Number(years)) : null;
  return (
    <Section title="Every start date">
      <Panel style={{ paddingVertical: 12, gap: 10 }}>
        <T v="caption" style={{ lineHeight: 17 }}>
          The same rules begun in each month and kept for a few years, so you see how much depended on when you happened to start.
        </T>
        <Segmented
          options={[
            { key: '1', label: '1 year' },
            { key: '3', label: '3 years' },
            { key: '5', label: '5 years' },
          ]}
          value={years}
          onChange={setYears}
        />
        {!starts.length ? (
          <T v="caption">Not enough history for {years}-year spans.</T>
        ) : busy != null ? (
          <T v="caption">
            Checking start {busy} of {starts.length}…
          </T>
        ) : !sum ? (
          <Button label={`Check all ${starts.length} start dates`} small onPress={run} />
        ) : (
          <>
            <T style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 }}>
              It beat the index in {Math.round(sum.ahead * 100)}% of the {sum.rows.length} start dates.
            </T>
            <Bars rows={sum.rows} />
            <T v="caption" style={{ lineHeight: 17 }}>
              Each bar is one start month, {sum.rows[0].start} to {sum.rows[sum.rows.length - 1].start}: green ahead of the index over the next {years} year{years === '1' ? '' : 's'}, red behind.
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[
                ['Typical', `${pc(sum.median)} a year`, `index ${pc(sum.medianBench)}`],
                ['Best start', `${pc(sum.best.cagr)} a year`, sum.best.start],
                ['Worst start', `${pc(sum.worst.cagr)} a year`, sum.worst.start],
              ].map(([k, v, sub]) => (
                <View key={k} style={{ width: '33%', gap: 2, paddingVertical: 4 }}>
                  <T v="caption">{k}</T>
                  <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{v}</T>
                  <T v="caption" style={{ fontSize: 11 }}>
                    {sub}
                  </T>
                </View>
              ))}
            </View>
          </>
        )}
      </Panel>
    </Section>
  );
}

/** Your real portfolio (from Sahm's daily snapshots) against the strategy over the same days. */
export function RealSection({ lab, st }: { lab: Lab; st: Strategy }) {
  const [out, setOut] = useState<{ from: string; to: string; mine: number; strat: number; bench: number } | null>(null);
  useEffect(() => {
    let alive = true;
    snapshots()
      .then((snaps) => {
        const tr = trackReturns(snaps.filter((s) => s.value > 0));
        if (tr.length < 2) return;
        const from = tr[0].day;
        const lastLab = lab.days[lab.days.length - 1];
        const to = tr[tr.length - 1].day <= lastLab ? tr[tr.length - 1].day : lastLab;
        const mineAt = [...tr].reverse().find((p) => p.day <= to);
        if (!mineAt || Date.parse(to) - Date.parse(from) < 20 * 864e5) return;
        const r = runBacktest(lab, { ...st, lump: 100000, monthly: 0, fromDay: from, untilDay: to });
        if (alive) setOut({ from, to, mine: mineAt.ret, strat: r.growth[r.growth.length - 1] - 1, bench: r.benchGrowth[r.benchGrowth.length - 1] - 1 });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lab, st]);
  if (!out) return null;
  const rows: [string, number][] = [
    ['Your portfolio', out.mine],
    ['This strategy', out.strat],
    ['Index with dividends', out.bench],
  ];
  return (
    <Section title="Against your real portfolio">
      <Panel style={{ paddingVertical: 8 }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: colors.hairline }}>
            <T style={{ flex: 1, fontFamily: i === 0 ? fonts.bold : fonts.medium, fontSize: 14 }}>{k}</T>
            <T v="mono" style={{ fontSize: 14, color: changeColor(v) }}>
              {pc(v)}
            </T>
          </View>
        ))}
      </Panel>
      <T v="caption" style={{ lineHeight: 17 }}>
        From {out.from}, when Sahm started keeping your daily snapshots, to {out.to}: growth without the money you added. A short span says little either way; it gets more useful the longer you use Sahm.
      </T>
    </Section>
  );
}

export function ReportButton({ lab, st, res }: { lab: Lab; st: Strategy; res: Result }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const share = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const html = labReportHtml(lab, st, res, new Date().toISOString().slice(0, 10));
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${st.name}: lab report`, UTI: 'com.adobe.pdf' });
      }
    } catch (e) {
      logProblem('lab report', e);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <Button label={busy ? 'Making the PDF…' : 'Share as a PDF report'} tone="ghost" onPress={share} disabled={busy} />
      {msg ? (
        <T v="caption" style={{ color: colors.downText }}>
          {msg}
        </T>
      ) : null}
    </View>
  );
}
