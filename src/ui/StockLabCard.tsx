/** Stock page: Rs 100,000 in this stock from the start of the lab's data, with dividends, against the index. Only when the lab's data is on the phone. */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changeColor, colors, fonts } from '../theme';
import { peekLab, rememberHunted } from '../lab/store';
import { runBacktest, type Strategy } from '../lab/engine';
import { BASE } from '../lab/templates';
import { Panel } from './bits';
import { Section, T } from './kit';

const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;

export function StockLabCard({ symbol }: { symbol: string }) {
  const nav = useNavigation();
  const [f, setF] = useState<{ id: string; from: string; final: number; cagr: number; bench: number; drop: number; divShare: number; benchName: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const lab = await peekLab().catch(() => null);
      const s = lab?.stocks.find((x) => x.symbol === symbol);
      if (!lab || !s || !alive) return;
      const st: Strategy = {
        ...BASE,
        id: `stock-${symbol}`,
        name: `${symbol} held`,
        only: [symbol],
        universe: 'all',
        minValue: 0,
        rank: 'value',
        hold: 1,
        every: 12,
        perSector: 0,
        filters: [],
        lump: 100000,
        monthly: 0,
        bench: s.kmi30 && !s.kse100 ? 'KMI30' : 'KSE100',
      };
      const r = runBacktest(lab, st);
      if (!r.trades.length || !alive) return;
      rememberHunted([st]);
      const gain = r.stats.final - r.stats.put;
      setF({
        id: st.id,
        from: lab.days[r.trades[0].i],
        final: r.stats.final,
        cagr: r.stats.cagr,
        bench: r.stats.benchCagr,
        drop: r.stats.maxDrop,
        divShare: gain > 0 ? r.stats.dividends / gain : 0,
        benchName: st.bench === 'KMI30' ? 'KMI-30' : 'KSE-100',
      });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [symbol]);
  if (!f) return null;
  return (
    <Section title="Held since the lab's data starts">
      <Pressable accessibilityRole="button" onPress={() => nav.navigate('LabResult', { id: f.id })}>
        <Panel style={{ paddingVertical: 12, gap: 6 }}>
          <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>
            Rs 100,000 put in on {f.from} would be <T style={{ fontFamily: fonts.bold }}>Rs {Math.round(f.final).toLocaleString('en-US')}</T> now, with dividends after filer tax.
          </T>
          <View style={{ flexDirection: 'row' }}>
            {[
              ['A year', pc(f.cagr), changeColor(f.cagr)],
              [`${f.benchName} a year`, pc(f.bench), colors.text2],
              ['Worst fall', pc(f.drop, 0), colors.downText],
            ].map(([k, v, c]) => (
              <View key={k} style={{ flex: 1, gap: 2 }}>
                <T v="caption">{k}</T>
                <T style={{ fontFamily: fonts.bold, fontSize: 15, color: c }}>{v}</T>
              </View>
            ))}
          </View>
          <T v="caption" style={{ lineHeight: 17 }}>
            {f.divShare > 0.05 ? `Dividends were ${Math.round(f.divShare * 100)}% of the gain. ` : ''}From the backtesting lab, after 0.2% costs. Tap to see it year by year. Information, not advice.
          </T>
        </Panel>
      </Pressable>
    </Section>
  );
}
