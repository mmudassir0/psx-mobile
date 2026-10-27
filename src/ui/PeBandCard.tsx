/** A stock's P/E over the last few years with its usual range shaded, and where today's sits. */
import React, { useMemo } from 'react';
import { Explain } from './Explain';
import { View } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { fmtDay } from '../format';
import type { Candle, CompanyInfo } from '../psx/types';
import { fiscalEndMonth } from '../analysis/fairValue';
import { peBand, profitsFrom } from '../analysis/peBand';
import { Panel } from './bits';
import { Section, T } from './kit';

export function PeBandCard({ company, daily }: { company: CompanyInfo | null; daily: Candle[] | null }) {
  const b = useMemo(
    () =>
      company && daily?.length && company.shares
        ? peBand({
            candles: daily,
            profits: profitsFrom(company.financialsAnnual),
            fyEndMonth: fiscalEndMonth(company.fiscalYearEnd),
            shares: company.shares,
          })
        : null,
    [company, daily],
  );
  if (!b) return null;
  const W = 320;
  const H = 110;
  const hi = Math.min(b.max, b.q3 * 2.5);
  const lo = Math.max(0, Math.min(b.min, b.now) * 0.9);
  const top = Math.max(hi, b.now) * 1.05;
  const x = (i: number) => (i / (b.points.length - 1)) * W;
  const y = (v: number) => 4 + ((top - Math.min(v, top)) / (top - lo || 1)) * (H - 8);
  const path = b.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.pe).toFixed(1)}`).join('');
  const pct = Math.round(b.cheaperThan * 100);
  const verdict = pct >= 75 ? 'cheap against its own history' : pct <= 25 ? 'expensive against its own history' : 'in its usual range';
  const tone = pct >= 75 ? colors.up : pct <= 25 ? colors.downText : colors.text;
  return (
    <Section title="P/E against its own history" extra={<Explain id="peBand" />}>
      <Panel style={{ paddingVertical: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T v="mono" style={{ fontSize: 22, color: tone }}>
            {b.now.toFixed(1)}×
          </T>
          <T style={{ fontFamily: fonts.semibold, fontSize: 14, color: tone, flex: 1 }}>{verdict}</T>
        </View>
        <T v="caption" style={{ lineHeight: 17 }}>
          Its P/E has been higher than today {pct}% of the time since {fmtDay(b.from)}. Usual range {b.q1.toFixed(1)}–{b.q3.toFixed(1)}× (middle
          half), median {b.median.toFixed(1)}×.
        </T>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Rect x={0} y={y(b.q3)} width={W} height={Math.max(1, y(b.q1) - y(b.q3))} fill={colors.goldSoft} />
          <Path d={`M0 ${y(b.median)}L${W} ${y(b.median)}`} stroke={colors.gold} strokeWidth={1} strokeDasharray="3 4" />
          <Path d={path} stroke={colors.text2} strokeWidth={1.6} fill="none" />
          <Circle cx={x(b.points.length - 1)} cy={y(b.now)} r={4} fill={tone} />
        </Svg>
        <T v="caption" style={{ lineHeight: 17 }}>
          P/E here is market value ÷ the last full year's profit, so it can differ from PSX's P/E on recent quarters. A low P/E against its own past
          can mean a bargain or a business that's getting worse: check why.
        </T>
      </Panel>
    </Section>
  );
}
