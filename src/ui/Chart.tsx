import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { Candle } from '../psx/types';
import { colors, fonts } from '../theme';
import { fmtNum, pkDate } from '../format';

export type ChartMode = 'candle' | 'line';
export type ChartUnit = 'intraday' | 'day' | 'week' | 'month';

const AXIS_W = 58;
const X_LABEL_H = 20;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const tagLabel = (v: number) => fmtNum(v, v >= 10_000 ? 0 : 2);

function niceStep(span: number, count: number) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

function priceLabel(v: number, step: number) {
  return fmtNum(v, step < 0.1 ? 2 : step < 1 ? 1 : 0);
}

export function timeLabel(t: number, unit: ChartUnit) {
  const d = pkDate(t);
  if (unit === 'intraday') return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (unit === 'day') return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

let gradientSeq = 0;

/**
 * Price chart: candles or a line, volume strip, right-hand price axis with the
 * latest price tagged, and a crosshair you drag with one finger.
 *
 * Smoothness: the vertical crosshair is an Animated view moved straight from
 * the gesture (no React render per touch event). React re-renders only the
 * small overlay and the header when the finger crosses into a new bar, and
 * the bars themselves are drawn once per data change.
 */
export function Chart({
  candles,
  mode,
  unit,
  prevClose,
  height = 250,
  volumeHeight = 46,
  header,
  onScrubChange,
}: {
  candles: Candle[];
  mode: ChartMode;
  unit: ChartUnit;
  prevClose?: number | null;
  height?: number;
  volumeHeight?: number;
  /** Rendered above the chart; receives the bar under the finger, or null. */
  header?: (active: Candle | null) => React.ReactNode;
  onScrubChange?: (scrubbing: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradId = useRef(`g${++gradientSeq}`).current;
  const lineX = useRef(new Animated.Value(0)).current;
  const lineOpacity = useRef(new Animated.Value(0)).current;
  const plotW = Math.max(0, width - AXIS_W);
  const n = candles.length;
  const total = height + volumeHeight + X_LABEL_H;

  const geo = useMemo(() => {
    if (n < 2 || plotW <= 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let vmax = 0;
    for (const c of candles) {
      const l = mode === 'candle' ? c.l : c.c;
      const h = mode === 'candle' ? c.h : c.c;
      if (l < lo) lo = l;
      if (h > hi) hi = h;
      if (c.v > vmax) vmax = c.v;
    }
    if (prevClose != null && unit === 'intraday') {
      lo = Math.min(lo, prevClose);
      hi = Math.max(hi, prevClose);
    }
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const step = niceStep(hi - lo, 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const slot = plotW / n;
    const x = (i: number) => i * slot + slot / 2;
    const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (height - 16);
    const vy = (v: number) => height + volumeHeight - (vmax > 0 ? (v / vmax) * (volumeHeight - 6) : 0);
    let line = '';
    candles.forEach((c, i) => {
      line += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(c.c).toFixed(1)}`;
    });
    const area = `${line}L${x(n - 1).toFixed(1)} ${height}L${x(0).toFixed(1)} ${height}Z`;
    const labelIdx = n > 6 ? [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1] : [0, n - 1];
    return { slot, x, y, vy, ticks, step, line, area, labelIdx };
  }, [candles, n, plotW, height, volumeHeight, mode, prevClose, unit]);

  const last = candles[n - 1];
  const ref = unit === 'intraday' && prevClose != null ? prevClose : candles[0]?.o ?? candles[0]?.c;
  const lineColor = last && ref != null && last.c < ref ? colors.down : colors.up;
  const bodyW = geo ? Math.max(1, Math.min(14, geo.slot * 0.64)) : 1;

  // --- gesture -------------------------------------------------------------
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const nRef = useRef(n);
  nRef.current = n;
  const cb = useRef({ onScrubChange });
  cb.current = { onScrubChange };
  const startX = useRef(0);
  const idx = useRef<number | null>(null);

  const track = (xPos: number) => {
    const g = geoRef.current;
    if (!g) return;
    const i = Math.max(0, Math.min(nRef.current - 1, Math.floor(xPos / g.slot)));
    if (i === idx.current) return;
    idx.current = i;
    lineX.setValue(g.x(i));
    lineOpacity.setValue(0.8);
    setActive(i);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };
  const trackRef = useRef(track);
  trackRef.current = track;

  const responder = useMemo(() => {
    const end = () => {
      idx.current = null;
      lineOpacity.setValue(0);
      setActive(null);
      cb.current.onScrubChange?.(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        // Android measures locationX against whatever is under the finger once it moves,
        // so follow the start point plus the gesture's horizontal distance instead.
        startX.current = e.nativeEvent.locationX;
        cb.current.onScrubChange?.(true);
        trackRef.current(startX.current);
      },
      onPanResponderMove: (_e, g) => trackRef.current(startX.current + g.dx),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, [lineOpacity]);

  // --- static layer: drawn once per data/size change ------------------------
  const base = useMemo(() => {
    if (!geo || width <= 0) return null;
    return (
      <Svg width={width} height={total} pointerEvents="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity={0.24} />
            <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {geo.ticks.map((v) => (
          <G key={v}>
            <Line x1={0} x2={plotW} y1={geo.y(v)} y2={geo.y(v)} stroke={colors.hairline} strokeWidth={1} />
            <SvgText x={plotW + 8} y={geo.y(v) + 4} fill={colors.faint} fontSize={11} fontFamily={fonts.medium}>
              {priceLabel(v, geo.step)}
            </SvgText>
          </G>
        ))}
        {prevClose != null && unit === 'intraday' ? (
          <Line x1={0} x2={plotW} y1={geo.y(prevClose)} y2={geo.y(prevClose)} stroke={colors.faint} strokeDasharray="2 4" strokeWidth={1} />
        ) : null}
        {candles.map((c, i) => (
          <Rect
            key={`v${c.t}`}
            x={geo.x(i) - bodyW / 2}
            y={geo.vy(c.v)}
            width={bodyW}
            height={Math.max(0, height + volumeHeight - geo.vy(c.v))}
            fill={c.c >= c.o ? colors.up : colors.down}
            opacity={0.28}
          />
        ))}
        {mode === 'line' ? (
          <>
            <Path d={geo.area} fill={`url(#${gradId})`} />
            <Path d={geo.line} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" />
          </>
        ) : (
          candles.map((c, i) => {
            const col = c.c >= c.o ? colors.up : colors.down;
            const top = geo.y(Math.max(c.o, c.c));
            const bot = geo.y(Math.min(c.o, c.c));
            return (
              <G key={c.t}>
                <Line x1={geo.x(i)} x2={geo.x(i)} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={col} strokeWidth={1} />
                <Rect x={geo.x(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bot - top)} fill={col} rx={bodyW > 4 ? 1 : 0} />
              </G>
            );
          })
        )}
        {last ? (
          <G>
            <Line x1={0} x2={plotW} y1={geo.y(last.c)} y2={geo.y(last.c)} stroke={lineColor} strokeDasharray="1 3" strokeWidth={1} />
            <Rect x={plotW + 2} y={geo.y(last.c) - 10} width={AXIS_W - 4} height={20} rx={5} fill={lineColor} />
            <SvgText x={plotW + 8} y={geo.y(last.c) + 4} fill={colors.ground} fontSize={11} fontFamily={fonts.bold}>
              {tagLabel(last.c)}
            </SvgText>
          </G>
        ) : null}
        {geo.labelIdx.map((i, k) => (
          <SvgText
            key={`x${i}`}
            x={k === 0 ? 0 : k === geo.labelIdx.length - 1 ? plotW : geo.x(i)}
            y={total - 4}
            fill={colors.faint}
            fontSize={11}
            fontFamily={fonts.medium}
            textAnchor={k === 0 ? 'start' : k === geo.labelIdx.length - 1 ? 'end' : 'middle'}
          >
            {timeLabel(candles[i].t, unit)}
          </SvgText>
        ))}
      </Svg>
    );
  }, [geo, width, total, gradId, lineColor, plotW, prevClose, unit, candles, bodyW, height, volumeHeight, mode, last]);

  const ac = active != null ? candles[active] : null;

  return (
    <View>
      {header ? <View style={styles.header}>{header(ac)}</View> : null}
      <View
        style={{ height: total }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        accessible
        accessibilityLabel={last ? `Price chart, last ${fmtNum(last.c)}. Drag to read values.` : 'Price chart'}
      >
        {base}
        <Animated.View
          pointerEvents="none"
          style={[styles.vline, { height: height + volumeHeight, opacity: lineOpacity, transform: [{ translateX: lineX }] }]}
        />
        {geo && ac && active != null ? (
          <Svg width={width} height={total} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Rect x={geo.x(active) - geo.slot / 2} y={0} width={geo.slot} height={height + volumeHeight} fill={colors.text} opacity={0.05} />
            <Line x1={0} x2={plotW} y1={geo.y(ac.c)} y2={geo.y(ac.c)} stroke={colors.muted} strokeWidth={1} strokeDasharray="3 3" />
            <Rect x={plotW + 2} y={geo.y(ac.c) - 10} width={AXIS_W - 4} height={20} rx={5} fill={colors.text} />
            <SvgText x={plotW + 8} y={geo.y(ac.c) + 4} fill={colors.ground} fontSize={11} fontFamily={fonts.bold}>
              {tagLabel(ac.c)}
            </SvgText>
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 24, justifyContent: 'center', marginBottom: 12 },
  vline: { position: 'absolute', left: 0, top: 0, width: 1, backgroundColor: colors.muted },
});
