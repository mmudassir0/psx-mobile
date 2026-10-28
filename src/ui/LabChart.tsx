/** A line chart for the lab: two or three series over the years, drag to read any day. */
import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { T } from './kit';

export interface LabSeries {
  name: string;
  values: ArrayLike<number>;
  color: string;
  width?: number;
  dash?: string;
  /** drawn as a filled area down to zero (for falls from the peak) */
  area?: boolean;
}

const MAX_PTS = 300;

export function LabChart({
  series,
  days,
  height = 200,
  log = false,
  fmt,
  zero = false,
}: {
  series: LabSeries[];
  days: string[];
  height?: number;
  log?: boolean;
  fmt: (v: number) => string;
  /** include zero on the scale (for falls) */
  zero?: boolean;
}) {
  const [w, setW] = useState(320);
  const [at, setAt] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; sideways: boolean } | null>(null);
  const n = days.length;
  const step = Math.max(1, Math.ceil(n / MAX_PTS));
  const idx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    if (out[out.length - 1] !== n - 1) out.push(n - 1);
    return out;
  }, [n, step]);
  const padL = 4,
    padR = 52,
    padT = 8,
    padB = 18;
  const H = height;
  const tf = (v: number) => (log ? Math.log(Math.max(v, 1e-9)) : v);
  const { lo, hi } = useMemo(() => {
    let lo = Infinity,
      hi = -Infinity;
    for (const s of series)
      for (const i of idx) {
        const v = s.values[i];
        if (!Number.isFinite(v) || (log && v <= 0)) continue;
        const x = tf(v);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    if (zero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (!(hi > lo)) {
      hi = lo + 1;
    }
    return { lo, hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, idx, log, zero]);
  const X = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (tf(v) - lo) / (hi - lo)) * (H - padT - padB);
  const path = (s: LabSeries) => {
    let d = '';
    for (const i of idx) {
      const v = s.values[i];
      if (!Number.isFinite(v) || (log && v <= 0)) continue;
      d += `${d ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
    }
    if (s.area && d) d += `L${X(n - 1).toFixed(1)} ${Y(0).toFixed(1)}L${X(0).toFixed(1)} ${Y(0).toFixed(1)}Z`;
    return d;
  };
  // grid: three values and a tick at each new year
  const ticks = [0, 0.5, 1].map((f) => {
    const x = lo + (hi - lo) * f;
    return log ? Math.exp(x) : x;
  });
  const years: { i: number; y: string }[] = [];
  for (let i = 1; i < n; i++) if (days[i].slice(0, 4) !== days[i - 1].slice(0, 4)) years.push({ i, y: days[i].slice(2, 4) });
  const everyYear = years.length > 8 ? 2 : 1;
  const onTouch = (x: number) => {
    const f = (x - padL) / (w - padL - padR);
    setAt(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, minHeight: 18, marginBottom: 4 }}>
        {at != null ? (
          <T v="caption" style={{ fontFamily: fonts.bold }}>
            {days[at]}
          </T>
        ) : null}
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: s.color }} />
            <T v="caption" style={{ fontSize: 11.5 }}>
              {s.name}
              {at != null && Number.isFinite(s.values[at]) ? `: ${fmt(s.values[at])}` : ''}
            </T>
          </View>
        ))}
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(Math.max(200, e.nativeEvent.layout.width))}
        // a tap or a sideways drag reads the chart; an up-or-down swipe is handed back to the page so it still scrolls
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, sideways: false };
          onTouch(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => {
          const d = drag.current;
          if (d && !d.sideways && Math.abs(e.nativeEvent.pageX - d.x) > 8 && Math.abs(e.nativeEvent.pageX - d.x) > Math.abs(e.nativeEvent.pageY - d.y)) d.sideways = true;
          onTouch(e.nativeEvent.locationX);
        }}
        onResponderRelease={() => setAt(null)}
        onResponderTerminate={() => setAt(null)}
        onResponderTerminationRequest={() => !drag.current?.sideways}
        accessibilityLabel={`Chart of ${series.map((s) => s.name).join(' and ')}`}
      >
        <Svg width={w} height={H}>
          {ticks.map((v, k) => (
            <React.Fragment key={k}>
              <Line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke={colors.hairline} strokeWidth={1} />
              <SvgText x={w - padR + 6} y={Y(v) + 4} fontSize={10} fill={colors.faint} fontFamily={fonts.medium}>
                {fmt(v)}
              </SvgText>
            </React.Fragment>
          ))}
          {years.map((y, k) =>
            k % everyYear === 0 ? (
              <React.Fragment key={y.i}>
                <Line x1={X(y.i)} x2={X(y.i)} y1={H - padB} y2={H - padB + 4} stroke={colors.line} strokeWidth={1} />
                <SvgText x={X(y.i) - 6} y={H - 3} fontSize={10} fill={colors.faint} fontFamily={fonts.medium}>
                  {`’${y.y}`}
                </SvgText>
              </React.Fragment>
            ) : null,
          )}
          {series.map((s) => (
            <Path key={s.name} d={path(s)} stroke={s.color} strokeWidth={s.width ?? 2} fill={s.area ? s.color + '33' : 'none'} strokeDasharray={s.dash} strokeLinejoin="round" />
          ))}
          {at != null ? <Line x1={X(at)} x2={X(at)} y1={padT} y2={H - padB} stroke={colors.muted} strokeWidth={1} /> : null}
        </Svg>
      </View>
    </View>
  );
}
