/** Extra sections on a lab result: every start date, against your real portfolio, and the PDF report. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Share, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { changeColor, colors, fonts } from '../theme';
import type { Lab } from '../lab/data';
import { runBacktest, type Result, type Strategy } from '../lab/engine';
import { rollOne, rollStarts, summariseRolling, type RollRow } from '../lab/rolling';
import { labReportHtml } from '../lab/report';
import { worstFalls } from '../lab/stress';
import { runMix } from '../lab/mix';
import { LabChart } from './LabChart';
import { strategyCode } from '../lab/share';
import { describe } from '../lab/describe';
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

/** The market's worst falls, and the strategy through each. */
export function StressSection({ lab, st, res }: { lab: Lab; st: Strategy; res: Result }) {
  const falls = useMemo(() => worstFalls(lab, res), [lab, res]);
  if (!falls.length) return null;
  const benchName = st.bench === 'KMI30' ? 'KMI-30' : 'KSE-100';
  return (
    <Section title="Through the worst falls">
      <Panel style={{ paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 6 }}>
          <T v="label" style={{ flex: 1 }}>
            Fall
          </T>
          <T v="label" style={{ width: 64, textAlign: 'right' }}>
            {benchName}
          </T>
          <T v="label" style={{ width: 64, textAlign: 'right' }}>
            Strategy
          </T>
        </View>
        {falls.map((f, i) => (
          <View key={f.from} style={{ paddingVertical: 8, gap: 3, borderBottomWidth: i < falls.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <T style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 13 }}>
                {f.from.slice(0, 7)} to {f.to.slice(0, 7)}
              </T>
              <T v="mono" style={{ width: 64, textAlign: 'right', fontSize: 13, color: changeColor(f.index) }}>
                {pc(f.index, 0)}
              </T>
              <T v="mono" style={{ width: 64, textAlign: 'right', fontSize: 13, color: changeColor(f.strategy - f.index) }}>
                {pc(f.strategy, 0)}
              </T>
            </View>
            {f.indexAfter != null && f.strategyAfter != null ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <T v="caption" style={{ flex: 1 }}>
                  6 months after the low
                </T>
                <T v="mono" style={{ width: 64, textAlign: 'right', fontSize: 12, color: colors.text2 }}>
                  {pc(f.indexAfter, 0)}
                </T>
                <T v="mono" style={{ width: 64, textAlign: 'right', fontSize: 12, color: changeColor(f.strategyAfter - f.indexAfter) }}>
                  {pc(f.strategyAfter, 0)}
                </T>
              </View>
            ) : null}
          </View>
        ))}
      </Panel>
      <T v="caption" style={{ lineHeight: 17 }}>
        Every time the {benchName} (with its dividends) fell 15% or more from a peak, and how the strategy did over the same days and the six months after. Strategy figures in green fell less (or bounced more) than the
        index.
      </T>
    </Section>
  );
}

/** Which stocks made, and lost, the money. */
export function ContributorsSection({ res, onOpen }: { res: Result; onOpen: (s: string) => void }) {
  const list = res.bySymbol;
  if (list.length < 2) return null;
  const total = list.reduce((a, x) => a + x.pnl, 0);
  const top = list.slice(0, 5);
  const bottom = list
    .slice(-3)
    .reverse()
    .filter((x) => x.pnl < 0);
  const best = list[0];
  const rs = (v: number) => `${v >= 0 ? '+' : '−'}Rs ${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  const row = (x: (typeof list)[number], i: number, n: number) => (
    <View key={x.symbol} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 6, borderBottomWidth: i < n - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
      <T accessibilityRole="link" onPress={() => onOpen(x.symbol)} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 14 }}>
        {x.symbol}
      </T>
      <T v="caption" style={{ width: 90, textAlign: 'right' }}>
        {total > 0 && x.pnl > 0 ? `${Math.round((x.pnl / total) * 100)}% of profit` : ''}
      </T>
      <T v="mono" style={{ width: 110, textAlign: 'right', fontSize: 13, color: changeColor(x.pnl) }}>
        {rs(x.pnl)}
      </T>
    </View>
  );
  return (
    <Section title="Stocks behind the result">
      <Panel style={{ paddingVertical: 4 }}>{top.map((x, i) => row(x, i, top.length))}</Panel>
      {bottom.length ? <Panel style={{ paddingVertical: 4 }}>{bottom.map((x, i) => row(x, i, bottom.length))}</Panel> : null}
      <T v="caption" style={{ lineHeight: 17 }}>
        Profit on each stock over the whole test: what it was sold for and is worth now, plus dividends, less what was paid. {list.length} stocks in all.{' '}
        {total > 0 && best.pnl / total > 0.4
          ? `${best.symbol} alone made ${Math.round((best.pnl / total) * 100)}% of the profit, so the result leans heavily on one lucky pick.`
          : 'The profit was spread across many stocks, not one lucky pick.'}
      </T>
    </Section>
  );
}

export function ShareCodeButton({ st }: { st: Strategy }) {
  return (
    <Button
      label="Send these rules as a code"
      tone="ghost"
      onPress={() => {
        const code = strategyCode(st);
        Share.share({ message: `My Sahm backtest strategy "${st.name}": ${describe(st)}\n\nOpen Sahm → Backtesting lab → Open a code, and paste:\n${code}` }).catch(() => {});
      }}
    />
  );
}

/** Put the compared strategies together, each with a share of the money. */
export function MixSection({ lab, strategies }: { lab: Lab; strategies: Strategy[] }) {
  const [parts, setParts] = useState<number[]>(strategies.map(() => 1));
  useEffect(() => setParts(strategies.map(() => 1)), [strategies]);
  const mix = useMemo(
    () =>
      strategies.length > 1
        ? runMix(
            lab,
            strategies.map((s, k) => ({ strategy: s, share: parts[k] ?? 1 })),
            100000,
            10000,
          )
        : null,
    [lab, strategies, parts],
  );
  if (!mix) return null;
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const days = lab.days.slice(mix.start, mix.start + mix.growth.length);
  const best = mix.parts.reduce((a, p) => (p.result.stats.maxDrop > a ? p.result.stats.maxDrop : a), -1);
  return (
    <Section title="Put them together">
      <Panel style={{ paddingVertical: 12, gap: 10 }}>
        {strategies.map((s, k) => (
          <View key={s.id} style={{ gap: 4 }}>
            <T style={{ fontFamily: fonts.semibold, fontSize: 13.5 }} numberOfLines={1}>
              {s.name}: {Math.round(((parts[k] ?? 0) / total) * 100)}% of the money
            </T>
            <Segmented
              options={[
                { key: '0', label: 'None' },
                { key: '1', label: '1 part' },
                { key: '2', label: '2 parts' },
                { key: '3', label: '3 parts' },
              ]}
              value={String(parts[k] ?? 1) as '0' | '1' | '2' | '3'}
              onChange={(v) => setParts((p) => p.map((x, j) => (j === k ? Number(v) : x)))}
            />
          </View>
        ))}
        <LabChart
          days={days}
          log
          fmt={(v) => v.toFixed(0)}
          series={[
            { name: 'The mix', values: Float64Array.from(mix.growth, (v) => v * 100), color: colors.gold, width: 2.2 },
            ...mix.parts.map((p, k) => ({
              name: p.name,
              values: Float64Array.from(p.result.growth.subarray(0, mix.growth.length), (v) => v * 100),
              color: [colors.shariah, colors.up, colors.downText][k % 3],
              width: 1.2,
            })),
            { name: 'Index', values: Float64Array.from(mix.benchGrowth, (v) => v * 100), color: colors.muted, width: 1.2, dash: '4 3' },
          ]}
        />
        <T style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 }}>
          {pc(mix.cagr)} a year, worst fall {pc(mix.maxDrop, 0)} (index {pc(mix.benchCagr)}).
        </T>
        <T v="caption" style={{ lineHeight: 17 }}>
          From {days[0]}, Rs 100,000 to start and Rs 10,000 a month split by the parts above, each part run on its own (money never moves between them).{' '}
          {mix.maxDrop > best + 0.02 ? 'The mix fell less at its worst than any one of them alone: that is what spreading buys you.' : 'Here the mix didn’t fall less than the steadiest one alone.'}
        </T>
      </Panel>
    </Section>
  );
}

/** Your holdings with a selling rule added: what would it have changed? */
export function RuleWhatIf({ lab, st }: { lab: Lab; st: Strategy }) {
  const rows = useMemo(() => {
    const base = { ...st, stop: 0, exit200: false, pauseBelow: undefined, cashEarns: true };
    const v: [string, Strategy][] = [
      ['Just holding them', base],
      ['Sell at 20% under the best price', { ...base, stop: 0.2 }],
      ['Sell under the 200-day average', { ...base, exit200: true }],
      ['Cash in weak markets', { ...base, pauseBelow: 0.4 }],
    ];
    return v.map(([label, s]) => {
      const r = runBacktest(lab, s);
      return { label, cagr: r.stats.cagr, drop: r.stats.maxDrop };
    });
  }, [lab, st]);
  return (
    <Section title="With a selling rule">
      <Panel style={{ paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <T v="label" style={{ flex: 1 }}>
            Your holdings…
          </T>
          <T v="label" style={{ width: 66, textAlign: 'right' }}>
            A year
          </T>
          <T v="label" style={{ width: 66, textAlign: 'right' }}>
            Worst fall
          </T>
        </View>
        {rows.map((r, i) => (
          <View key={r.label} style={{ flexDirection: 'row', paddingVertical: 9, gap: 6, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
            <T style={{ flex: 1, fontSize: 13.5, fontFamily: i === 0 ? fonts.bold : fonts.medium }}>{r.label}</T>
            <T v="mono" style={{ width: 66, textAlign: 'right', fontSize: 13, color: changeColor(r.cagr - rows[0].cagr) }}>
              {pc(r.cagr)}
            </T>
            <T v="mono" style={{ width: 66, textAlign: 'right', fontSize: 13, color: r.drop > rows[0].drop + 0.01 ? colors.up : colors.text2 }}>
              {pc(r.drop, 0)}
            </T>
          </View>
        ))}
      </Panel>
      <T v="caption" style={{ lineHeight: 17 }}>
        The same stocks with a rule for selling; money from a sale waits in cash (earning money-market profit) until the next yearly check. Green: better than just holding. Information, not advice.
      </T>
    </Section>
  );
}
