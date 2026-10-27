/** How today's holdings did in the KSE-100's biggest past falls, and how much they move with it. */
import { BENCHMARK } from '../analysis/market';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, themed } from '../theme';
import { fmtDay } from '../format';
import type { Candle, SeriesPoint } from '../psx/types';
import { fetchSeries } from '../psx/api';
import { cached } from '../psx/cache';
import { hurtsMost, shockLoss, stressTest } from '../portfolio/stress';
import { Panel } from './bits';
import { T } from './kit';

const pc = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const mon = (t: number) => new Date(t + 5 * 3600_000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function StressCard({ rows, candles }: { rows: { symbol: string; value: number }[]; candles: Record<string, Candle[] | null> }) {
  const [index, setIndex] = useState<SeriesPoint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [fall, setFall] = useState(-0.2);
  useEffect(() => {
    cached(`eod:${BENCHMARK}`, 30 * 60_000, () => fetchSeries('eod', BENCHMARK), { persist: true })
      .then(setIndex)
      .catch((e) => setErr((e as Error).message));
  }, []);
  const res = useMemo(
    () => (index?.length ? stressTest(rows.map((r) => ({ symbol: r.symbol, value: r.value, candles: candles[r.symbol] ?? null })), index) : null),
    [index, rows, candles],
  );
  if (err) return <T v="caption">Couldn't load KSE-100 history: {err}</T>;
  if (!res) return <T v="caption">Loading KSE-100 history…</T>;
  const b = res.beta;
  const sens = [...res.betas].filter((x) => x.beta != null).sort((a, c) => (c.beta as number) - (a.beta as number));
  const values = Object.fromEntries(rows.map((r) => [r.symbol, r.value]));
  const total = rows.reduce((a, r) => a + r.value, 0);
  const shock = shockLoss(
    rows.map((r) => ({ symbol: r.symbol, value: r.value, beta: res.betas.find((x) => x.symbol === r.symbol)?.beta ?? null })),
    fall,
    b ?? 1,
  );
  const hurt = hurtsMost(res, values);
  const rs = (v: number) => `Rs ${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
  return (
    <View style={{ gap: 12 }}>
      <Panel style={{ paddingVertical: 16, gap: 8 }}>
        <T v="caption">If KSE-100 falls 10%</T>
        <T style={{ fontFamily: fonts.heavy, fontSize: 22, color: colors.downText }}>{b != null ? `your portfolio typically falls ${(b * 10).toFixed(1)}%` : '—'}</T>
        <T v="caption" style={{ lineHeight: 18 }}>
          From how each holding moved with the index over the last two years{res.coverage < 0.99 ? ` (${Math.round(res.coverage * 100)}% of your money has enough history)` : ''}. Above 10% means your
          holdings swing more than the market.
        </T>
        {sens.length ? (
          <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
            Swings most: {sens.slice(0, 3).map((x) => `${x.symbol} ${(x.beta as number).toFixed(1)}×`).join(', ')}. Steadiest:{' '}
            {sens.slice(-3).reverse().map((x) => `${x.symbol} ${(x.beta as number).toFixed(1)}×`).join(', ')}.
          </T>
        ) : null}
      </Panel>

      <Panel style={{ paddingVertical: 14, gap: 8 }}>
        <T v="caption">If KSE-100 fell this much now</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[-0.1, -0.2, -0.3].map((f) => (
            <Pressable key={f} accessibilityRole="radio" accessibilityState={{ selected: fall === f }} onPress={() => setFall(f)} style={[styles.pill, fall === f && { backgroundColor: colors.gold }]}>
              <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: fall === f ? colors.onGold : colors.text2 }}>{Math.round(f * 100)}%</T>
            </Pressable>
          ))}
        </View>
        <T style={{ fontFamily: fonts.heavy, fontSize: 22, color: colors.downText }}>
          about −{rs(shock.loss)} ({pc(shock.pct)})
        </T>
        <T v="body" style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2 }}>
          Most of it from {shock.rows.slice(0, 3).map((x) => `${x.symbol} −${rs(x.loss)}`).join(', ')}.
        </T>
        {hurt.length && hurt[0].avgLoss < 0 ? (
          <T v="body" style={{ fontSize: 13.5, lineHeight: 19 }}>
            In past falls, <T style={{ fontFamily: fonts.bold, fontSize: 13.5 }}>{hurt[0].symbol}</T> did the most damage: about {Math.round(hurt[0].share * 100)}% of the loss on average ({rs(hurt[0].avgLoss)} at today's
            value).
          </T>
        ) : null}
        <T v="caption" style={{ lineHeight: 17 }}>
          A rough guide from each holding's usual swing against the index{total ? `, on ${rs(total)}` : ''}. In a real crash shares often fall together, so it can be worse.
        </T>
      </Panel>

      <T v="label">The KSE-100's biggest falls (10% or more) since PSX's index history starts</T>
      {res.episodes.length === 0 ? <T v="caption">No fall of 10% or more in the available history.</T> : null}
      {[...res.episodes].reverse().map((ep, i) => (
        <Panel key={ep.e.peakT} style={{ paddingVertical: 12, gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(open === i ? null : i)} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="body" style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
                {mon(ep.e.peakT)} – {mon(ep.e.troughT)}
              </T>
              <T v="mono" style={{ fontSize: 14.5, color: colors.downText }}>
                KSE-100 {pc(ep.e.fall)}
              </T>
            </View>
            <T v="body" style={{ fontSize: 14 }}>
              Your holdings today: <T style={{ fontFamily: fonts.bold, fontSize: 14, color: (ep.portfolio ?? 0) < ep.e.fall ? colors.downText : colors.text }}>{pc(ep.portfolio)}</T>
              {ep.portfolio != null && ep.portfolio < 0 && total ? <T v="caption"> (about −{rs(ep.portfolio * total * ep.coverage)} today)</T> : null}
              {ep.coverage < 0.95 ? <T v="caption"> ({Math.round(ep.coverage * 100)}% of holdings existed then)</T> : null}
            </T>
            <T v="caption">
              Worst {ep.worst ? `${ep.worst.symbol} ${pc(ep.worst.change)}` : '—'} · best {ep.best ? `${ep.best.symbol} ${pc(ep.best.change)}` : '—'} ·{' '}
              {ep.e.recoveredT ? `index recovered by ${fmtDay(ep.e.recoveredT)}` : 'index not yet back to its peak'}
            </T>
            <T style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.gold }}>{open === i ? 'Hide stocks' : 'Each stock'}</T>
          </Pressable>
          {open === i ? (
            <View>
              {[...ep.rows]
                .sort((a, c) => (a.r?.change ?? 9) - (c.r?.change ?? 9))
                .map((x) => (
                  <View key={x.symbol} style={styles.row}>
                    <T v="body" style={{ flex: 1, fontSize: 14 }}>
                      {x.symbol}
                    </T>
                    <T v="caption" style={{ width: 110, textAlign: 'right' }}>
                      {x.r ? (x.r.recoveryDays != null ? `back in ${x.r.recoveryDays} days` : 'not back yet') : 'not listed then'}
                    </T>
                    <T v="mono" style={{ width: 72, textAlign: 'right', fontSize: 14, color: (x.r?.change ?? 0) < 0 ? colors.downText : colors.up }}>
                      {pc(x.r?.change)}
                    </T>
                  </View>
                ))}
            </View>
          ) : null}
        </Panel>
      ))}
      <T v="caption" style={{ lineHeight: 18 }}>
        Each fall runs from the index's peak to its lowest close. Your holdings are measured over the same dates, as if you had held today's
        portfolio then. Past falls show how these stocks have reacted to shocks; the next one can be different.
      </T>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pill: { paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.surface2 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline },
  }),
);
