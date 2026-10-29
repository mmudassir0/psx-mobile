import React, { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import type { SeriesPoint } from '../psx/types';
import { colors } from '../theme';
import { fmtDateTime, fmtDay, fmtPrice } from '../format';
import { T } from './kit';

/**
 * Area chart of a price series. Drag a finger across it to read any point.
 * PSX's daily series carries close (and open) but no high/low, so a line is
 * the honest picture here rather than invented candles.
 */
export function PriceChart({
  points,
  height = 200,
  intraday,
  baseline,
  onScrub,
}: {
  points: SeriesPoint[];
  height?: number;
  intraday?: boolean;
  /** dashed reference line, e.g. yesterday's close */
  baseline?: number | null;
  onScrub?: (p: SeriesPoint | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 10, bottom: 10 };

  const geo = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    if (baseline != null) {
      min = Math.min(min, baseline);
      max = Math.max(max, baseline);
    }
    if (max === min) {
      max += 1;
      min -= 1;
    }
    const h = height - pad.top - pad.bottom;
    const x = (i: number) => (i / (points.length - 1)) * width;
    const y = (v: number) => pad.top + ((max - v) / (max - min)) * h;
    let d = '';
    points.forEach((p, i) => {
      d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`;
    });
    const area = `${d}L${width} ${height}L0 ${height}Z`;
    return { d, area, x, y, min, max };
  }, [points, width, height, baseline]);

  const first = points[0]?.v;
  const last = points[points.length - 1]?.v;
  const ref = baseline ?? first;
  const up = last != null && ref != null ? last >= ref : true;
  const stroke = up ? colors.up : colors.down;

  const pick = (e: GestureResponderEvent) => {
    if (!width || points.length < 2) return;
    const xPos = Math.max(0, Math.min(width, e.nativeEvent.locationX));
    const i = Math.round((xPos / width) * (points.length - 1));
    setActive(i);
    onScrub?.(points[i]);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => pickRef.current(e),
        onPanResponderMove: (e) => pickRef.current(e),
        onPanResponderRelease: () => {
          setActive(null);
          onScrub?.(null);
        },
        onPanResponderTerminate: () => {
          setActive(null);
          onScrub?.(null);
        },
      }),
    [onScrub],
  );

  const ap = active != null ? points[active] : null;

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        accessible
        accessibilityLabel={points.length > 1 ? `Price chart from ${fmtPrice(first)} to ${fmtPrice(last)}` : 'Price chart, no data'}
      >
        {geo ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {baseline != null && <Line x1={0} x2={width} y1={geo.y(baseline)} y2={geo.y(baseline)} stroke={colors.faint} strokeDasharray="3 5" strokeWidth={1} />}
            <Path d={geo.area} fill="url(#fill)" />
            <Path d={geo.d} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {ap && active != null && (
              <>
                <Line x1={geo.x(active)} x2={geo.x(active)} y1={0} y2={height} stroke={colors.muted} strokeWidth={1} />
                <Path d={`M${geo.x(active) - 4} ${geo.y(ap.v)}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0`} fill={stroke} stroke={colors.ground} strokeWidth={2} />
              </>
            )}
          </Svg>
        ) : (
          <View style={styles.empty}>
            <T v="caption">{points.length < 2 ? 'No chart data for this range' : ''}</T>
          </View>
        )}
      </View>
      {geo && (
        <View style={styles.axis}>
          <T v="caption">{intraday ? fmtDateTime(points[0].t).split(', ')[1] : fmtDay(points[0].t)}</T>
          <T v="caption">
            Low {fmtPrice(geo.min)} · High {fmtPrice(geo.max)}
          </T>
          <T v="caption">{intraday ? fmtDateTime(points[points.length - 1].t).split(', ')[1] : fmtDay(points[points.length - 1].t)}</T>
        </View>
      )}
    </View>
  );
}

/** Small non-interactive line for lists. */
export function Sparkline({ values, width = 64, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * width).toFixed(1)} ${(2 + ((max - v) / span) * (height - 4)).toFixed(1)}`).join('');
  const color = values[values.length - 1] >= values[0] ? colors.up : colors.down;
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
