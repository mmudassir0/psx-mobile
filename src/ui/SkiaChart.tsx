import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Canvas, Group, Line, Path, RoundedRect, Skia, Text, useFont, vec, LinearGradient } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Candle } from '../psx/types';
import { colors } from '../theme';
import { T } from './kit';

export type ChartMode = 'candle' | 'line';
export type ChartUnit = 'intraday' | 'day' | 'week' | 'month';

const AXIS_W = 60;
const X_LABEL_H = 22;
const TICKS = 6;
const MIN_BARS = 8;

const UP = colors.up;
const DOWN = colors.down;

// ---------------------------------------------------------------------------
// Worklet helpers (run on the UI thread, so no Intl / regex-heavy code)
// ---------------------------------------------------------------------------

function fmtNum(v: number, decimals: number): string {
  'worklet';
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const dot = fixed.indexOf('.');
  const int = dot >= 0 ? fixed.slice(0, dot) : fixed;
  const frac = dot >= 0 ? fixed.slice(dot) : '';
  let out = '';
  for (let i = 0; i < int.length; i++) {
    const fromEnd = int.length - i;
    out += int[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return (neg ? '-' : '') + out + frac;
}

function tagText(v: number): string {
  'worklet';
  return fmtNum(v, v >= 10000 ? 0 : 2);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timeText(t: number, unit: ChartUnit): string {
  'worklet';
  const d = new Date(t + 5 * 3600000);
  if (unit === 'intraday') {
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  if (unit === 'day') return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  return MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2);
}

function niceStep(span: number, count: number): number {
  'worklet';
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

interface Series {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

/**
 * Candlestick / line chart drawn with Skia on the UI thread.
 *  - hold, then drag: crosshair with a readout of that bar
 *  - swipe left/right: scroll through history
 *  - pinch: zoom in and out
 * Pass the full series and how many recent bars to show first.
 */
export function SkiaChart({
  candles,
  visible,
  mode,
  unit,
  prevClose,
  height = 250,
  volumeHeight = 46,
  header,
  onScrubChange,
}: {
  candles: Candle[];
  /** bars shown at first (the rest is reachable by swiping) */
  visible: number;
  mode: ChartMode;
  unit: ChartUnit;
  prevClose?: number | null;
  height?: number;
  volumeHeight?: number;
  header?: (active: Candle | null) => React.ReactNode;
  onScrubChange?: (scrubbing: boolean) => void;
}) {
  const font = useFont(require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'), 11);
  const fontBold = useFont(require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'), 11);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const total = height + volumeHeight + X_LABEL_H;

  const data = useSharedValue<Series>({ t: [], o: [], h: [], l: [], c: [], v: [] });
  const W = useSharedValue(0);
  const end = useSharedValue(0); // right edge, in bars (exclusive)
  const count = useSharedValue(1); // bars across the plot
  const isLine = useSharedValue(mode === 'line' ? 1 : 0);
  const prev = useSharedValue(prevClose ?? -1);
  const cross = useSharedValue(-1); // active bar index, -1 = none
  const startEnd = useSharedValue(0);
  const startCount = useSharedValue(1);

  useEffect(() => {
    const n = candles.length;
    data.value = {
      t: candles.map((c) => c.t),
      o: candles.map((c) => c.o),
      h: candles.map((c) => c.h),
      l: candles.map((c) => c.l),
      c: candles.map((c) => c.c),
      v: candles.map((c) => c.v),
    };
    const vis = Math.max(Math.min(n, MIN_BARS), Math.min(n, visible));
    count.value = vis;
    end.value = n;
    cross.value = -1;
    setActiveIdx(null);
  }, [candles, visible, data, count, end, cross]);

  useEffect(() => {
    isLine.value = mode === 'line' ? 1 : 0;
  }, [mode, isLine]);
  useEffect(() => {
    prev.value = prevClose ?? -1;
  }, [prevClose, prev]);

  // ---- frame geometry (runs on the UI thread whenever the viewport changes) ----
  const geo = useDerivedValue(() => {
    const d = data.value;
    const n = d.c.length;
    const plotW = Math.max(1, W.value - AXIS_W);
    const cnt = Math.max(1, count.value);
    const e = end.value;
    const slot = plotW / cnt;
    const i0 = Math.max(0, Math.floor(e - cnt) - 1);
    const i1 = Math.min(n - 1, Math.ceil(e));
    let lo = Infinity;
    let hi = -Infinity;
    let vmax = 0;
    const line = isLine.value === 1;
    for (let i = i0; i <= i1; i++) {
      const l = line ? d.c[i] : d.l[i];
      const h = line ? d.c[i] : d.h[i];
      if (l < lo) lo = l;
      if (h > hi) hi = h;
      if (d.v[i] > vmax) vmax = d.v[i];
    }
    if (prev.value > 0 && unit === 'intraday') {
      lo = Math.min(lo, prev.value);
      hi = Math.max(hi, prev.value);
    }
    if (!isFinite(lo) || !isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    return { n, plotW, slot, i0, i1, lo, hi, vmax, e, cnt };
  });

  const paths = useDerivedValue(() => {
    const g = geo.value;
    const d = data.value;
    const upBody = Skia.Path.Make();
    const upWick = Skia.Path.Make();
    const dnBody = Skia.Path.Make();
    const dnWick = Skia.Path.Make();
    const volUp = Skia.Path.Make();
    const volDn = Skia.Path.Make();
    const linePath = Skia.Path.Make();
    const area = Skia.Path.Make();
    const grid = Skia.Path.Make();
    if (g.n < 1) return { upBody, upWick, dnBody, dnWick, volUp, volDn, linePath, area, grid };
    const x = (i: number) => (i - (g.e - g.cnt)) * g.slot + g.slot / 2;
    const y = (v: number) => 8 + ((g.hi - v) / (g.hi - g.lo)) * (height - 16);
    const bw = Math.max(1, Math.min(14, g.slot * 0.64));
    const line = isLine.value === 1;
    let first = true;
    for (let i = g.i0; i <= g.i1; i++) {
      const cx = x(i);
      if (cx < -g.slot || cx > g.plotW + g.slot) continue;
      const up = d.c[i] >= d.o[i];
      // volume
      if (g.vmax > 0) {
        const vh = (d.v[i] / g.vmax) * (volumeHeight - 6);
        (up ? volUp : volDn).addRect({ x: cx - bw / 2, y: height + volumeHeight - vh, width: bw, height: vh });
      }
      if (line) {
        const py = y(d.c[i]);
        if (first) {
          linePath.moveTo(cx, py);
          area.moveTo(cx, height);
          area.lineTo(cx, py);
          first = false;
        } else {
          linePath.lineTo(cx, py);
          area.lineTo(cx, py);
        }
      } else {
        const top = y(Math.max(d.o[i], d.c[i]));
        const bot = y(Math.min(d.o[i], d.c[i]));
        (up ? upWick : dnWick).moveTo(cx, y(d.h[i]));
        (up ? upWick : dnWick).lineTo(cx, y(d.l[i]));
        (up ? upBody : dnBody).addRect({ x: cx - bw / 2, y: top, width: bw, height: Math.max(1, bot - top) });
      }
    }
    if (line && !first) {
      const lastX = x(Math.min(g.i1, g.n - 1));
      area.lineTo(lastX, height);
      area.close();
    }
    return { upBody, upWick, dnBody, dnWick, volUp, volDn, linePath, area, grid };
  });

  const upBody = useDerivedValue(() => paths.value.upBody);
  const upWick = useDerivedValue(() => paths.value.upWick);
  const dnBody = useDerivedValue(() => paths.value.dnBody);
  const dnWick = useDerivedValue(() => paths.value.dnWick);
  const volUp = useDerivedValue(() => paths.value.volUp);
  const volDn = useDerivedValue(() => paths.value.volDn);
  const linePath = useDerivedValue(() => paths.value.linePath);
  const area = useDerivedValue(() => paths.value.area);

  // colour of the line/tag: up if the last visible close is above the first visible one (or prev close for 1D)
  const trendUp = useDerivedValue(() => {
    const g = geo.value;
    const d = data.value;
    if (g.n < 1) return 1;
    const lastI = Math.min(g.n - 1, Math.ceil(g.e) - 1);
    const firstI = Math.max(0, Math.floor(g.e - g.cnt));
    const ref = prev.value > 0 && unit === 'intraday' ? prev.value : d.c[firstI];
    return d.c[lastI] >= ref ? 1 : 0;
  });
  const trendColor = useDerivedValue(() => (trendUp.value === 1 ? UP : DOWN));
  const upOpacity = useDerivedValue(() => trendUp.value);
  const dnOpacity = useDerivedValue(() => 1 - trendUp.value);
  const plotClip = useDerivedValue(() => Skia.XYWHRect(0, 0, geo.value.plotW, height + volumeHeight));

  // price axis ticks
  const tickVals = useDerivedValue(() => {
    const g = geo.value;
    const step = niceStep(g.hi - g.lo, 4);
    const out: number[] = [];
    for (let v = Math.ceil(g.lo / step) * step; v <= g.hi && out.length < TICKS; v += step) out.push(v);
    return { out, step };
  });
  const yOf = (v: number) => {
    'worklet';
    const g = geo.value;
    return 8 + ((g.hi - v) / (g.hi - g.lo)) * (height - 16);
  };
  const gridPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const plotW = geo.value.plotW;
    for (const v of tickVals.value.out) {
      const yy = yOf(v);
      p.moveTo(0, yy);
      p.lineTo(plotW, yy);
    }
    return p;
  });
  const tickY = [0, 1, 2, 3, 4, 5].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const t = tickVals.value.out;
      return k < t.length ? yOf(t[k]) + 4 : -100;
    }),
  );
  const tickT = [0, 1, 2, 3, 4, 5].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const { out, step } = tickVals.value;
      if (k >= out.length) return '';
      return fmtNum(out[k], step < 0.1 ? 2 : step < 1 ? 1 : 0);
    }),
  );

  // latest visible price tag
  const lastC = useDerivedValue(() => {
    const g = geo.value;
    const d = data.value;
    if (g.n < 1) return 0;
    return d.c[Math.min(g.n - 1, Math.max(0, Math.ceil(g.e) - 1))];
  });
  const lastY = useDerivedValue(() => yOf(lastC.value));
  const lastTagY = useDerivedValue(() => lastY.value - 10);
  const lastTextY = useDerivedValue(() => lastY.value + 4);
  const lastText = useDerivedValue(() => tagText(lastC.value));
  const lastP1 = useDerivedValue(() => vec(0, lastY.value));
  const lastP2 = useDerivedValue(() => vec(geo.value.plotW, lastY.value));
  const prevY = useDerivedValue(() => (prev.value > 0 && unit === 'intraday' ? yOf(prev.value) : -100));
  const prevP1 = useDerivedValue(() => vec(0, prevY.value));
  const prevP2 = useDerivedValue(() => vec(geo.value.plotW, prevY.value));

  // x labels: left, middle, right of the visible window
  const xLabel = (pos: 0 | 1 | 2) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const g = geo.value;
      const d = data.value;
      if (g.n < 1) return '';
      const left = Math.max(0, Math.ceil(g.e - g.cnt));
      const right = Math.min(g.n - 1, Math.ceil(g.e) - 1);
      const i = pos === 0 ? left : pos === 2 ? right : Math.round((left + right) / 2);
      return timeText(d.t[i], unit);
    });
  const xL = xLabel(0);
  const xM = xLabel(1);
  const xR = xLabel(2);
  const xRx = useDerivedValue(() => geo.value.plotW - (font ? font.measureText(xR.value).width : 40));
  const xMx = useDerivedValue(() => geo.value.plotW / 2 - (font ? font.measureText(xM.value).width / 2 : 20));

  // crosshair
  const crossX = useDerivedValue(() => {
    const g = geo.value;
    if (cross.value < 0) return -100;
    return (cross.value - (g.e - g.cnt)) * g.slot + g.slot / 2;
  });
  const crossC = useDerivedValue(() => (cross.value < 0 ? 0 : data.value.c[cross.value]));
  const crossY = useDerivedValue(() => (cross.value < 0 ? -100 : yOf(crossC.value)));
  const crossV1 = useDerivedValue(() => vec(crossX.value, 0));
  const crossV2 = useDerivedValue(() => vec(crossX.value, height + volumeHeight));
  const crossH1 = useDerivedValue(() => vec(0, crossY.value));
  const crossH2 = useDerivedValue(() => vec(geo.value.plotW, crossY.value));
  const crossTagY = useDerivedValue(() => crossY.value - 10);
  const crossTextY = useDerivedValue(() => crossY.value + 4);
  const crossText = useDerivedValue(() => (cross.value < 0 ? '' : tagText(crossC.value)));
  const crossOpacity = useDerivedValue(() => (cross.value < 0 ? 0 : 1));
  const tagX = useDerivedValue(() => geo.value.plotW + 2);
  const tagTextX = useDerivedValue(() => geo.value.plotW + 8);
  const gradStart = vec(0, 0);
  const gradEnd = vec(0, height);

  // ---- gestures ---------------------------------------------------------------
  const tick = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, []);
  const report = useCallback((i: number) => setActiveIdx(i < 0 ? null : i), []);
  const scrub = useCallback((on: boolean) => onScrubChange?.(on), [onScrubChange]);

  const pickBar = (xPos: number) => {
    'worklet';
    const g = geo.value;
    const i = Math.max(0, Math.min(g.n - 1, Math.floor(g.e - g.cnt + xPos / g.slot)));
    if (i !== cross.value) {
      cross.value = i;
      runOnJS(report)(i);
      runOnJS(tick)();
    }
  };

  const crosshair = Gesture.Pan()
    .activateAfterLongPress(160)
    .onStart((e) => {
      runOnJS(scrub)(true);
      pickBar(e.x);
    })
    .onUpdate((e) => pickBar(e.x))
    .onFinalize(() => {
      if (cross.value >= 0) {
        cross.value = -1;
        runOnJS(report)(-1);
      }
      runOnJS(scrub)(false);
    });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onStart(() => {
      startEnd.value = end.value;
    })
    .onUpdate((e) => {
      const g = geo.value;
      const next = startEnd.value - e.translationX / g.slot;
      end.value = Math.max(Math.min(g.cnt, g.n), Math.min(g.n, next));
    })
    .onEnd((e) => {
      // a little momentum, then settle
      const g = geo.value;
      const fling = end.value - (e.velocityX / g.slot) * 0.25;
      end.value = withTiming(Math.max(Math.min(g.cnt, g.n), Math.min(g.n, fling)), { duration: 300 });
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startCount.value = count.value;
      startEnd.value = end.value;
    })
    .onUpdate((e) => {
      const n = data.value.c.length;
      const next = Math.max(Math.min(MIN_BARS, n), Math.min(n, startCount.value / e.scale));
      count.value = next;
      end.value = Math.max(next, Math.min(n, startEnd.value));
    });

  const gesture = Gesture.Race(crosshair, Gesture.Simultaneous(pan, pinch));

  const active = activeIdx != null ? candles[activeIdx] ?? null : null;

  return (
    <View>
      {header ? <View style={styles.header}>{header(active)}</View> : null}
      <GestureDetector gesture={gesture}>
        <View
          style={{ height: total }}
          onLayout={(e) => {
            setWidth(e.nativeEvent.layout.width);
            W.value = e.nativeEvent.layout.width;
          }}
          accessible
          accessibilityLabel="Price chart. Hold to read values, swipe to scroll, pinch to zoom."
        >
          {width > 0 ? (
            <Canvas style={{ width, height: total }}>
              <Path path={gridPath} style="stroke" strokeWidth={1} color={colors.hairline} />
              <Line p1={prevP1} p2={prevP2} color={colors.faint} strokeWidth={1} style="stroke" opacity={0.7} />
              <Group clip={plotClip}>
              <Path path={volUp} color={UP} opacity={0.28} />
              <Path path={volDn} color={DOWN} opacity={0.28} />
              {mode === 'line' ? (
                <Group>
                  <Path path={area} opacity={upOpacity}>
                    <LinearGradient start={gradStart} end={gradEnd} colors={['rgba(34,195,142,0.26)', 'rgba(34,195,142,0)']} />
                  </Path>
                  <Path path={area} opacity={dnOpacity}>
                    <LinearGradient start={gradStart} end={gradEnd} colors={['rgba(242,92,106,0.26)', 'rgba(242,92,106,0)']} />
                  </Path>
                  <Path path={linePath} style="stroke" strokeWidth={2} color={trendColor} strokeJoin="round" />
                </Group>
              ) : (
                <Group>
                  <Path path={upWick} style="stroke" strokeWidth={1} color={UP} />
                  <Path path={dnWick} style="stroke" strokeWidth={1} color={DOWN} />
                  <Path path={upBody} color={UP} />
                  <Path path={dnBody} color={DOWN} />
                </Group>
              )}
              </Group>
              {/* price axis */}
              {font
                ? tickT.map((t, k) => <Text key={k} x={tagTextX} y={tickY[k]} text={t} font={font} color={colors.faint} />)
                : null}
              {/* latest price */}
              <Line p1={lastP1} p2={lastP2} color={trendColor} strokeWidth={1} style="stroke" opacity={0.6} />
              <RoundedRect x={tagX} y={lastTagY} width={AXIS_W - 4} height={20} r={5} color={trendColor} />
              {fontBold ? <Text x={tagTextX} y={lastTextY} text={lastText} font={fontBold} color={colors.ground} /> : null}
              {/* time labels */}
              {font ? (
                <Group>
                  <Text x={0} y={total - 5} text={xL} font={font} color={colors.faint} />
                  <Text x={xMx} y={total - 5} text={xM} font={font} color={colors.faint} />
                  <Text x={xRx} y={total - 5} text={xR} font={font} color={colors.faint} />
                </Group>
              ) : null}
              {/* crosshair */}
              <Group opacity={crossOpacity}>
                <Line p1={crossV1} p2={crossV2} color={colors.muted} strokeWidth={1} style="stroke" />
                <Line p1={crossH1} p2={crossH2} color={colors.muted} strokeWidth={1} style="stroke" />
                <RoundedRect x={tagX} y={crossTagY} width={AXIS_W - 4} height={20} r={5} color={colors.text} />
                {fontBold ? <Text x={tagTextX} y={crossTextY} text={crossText} font={fontBold} color={colors.ground} /> : null}
              </Group>
            </Canvas>
          ) : null}
        </View>
      </GestureDetector>
      <T v="caption" style={styles.hint}>
        Hold to inspect · swipe for history · pinch to zoom
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 24, justifyContent: 'center', marginBottom: 12 },
  hint: { fontSize: 11.5, color: colors.faint, textAlign: 'center', marginTop: 6, marginRight: AXIS_W / 2 },
});

export type { SkPath };
