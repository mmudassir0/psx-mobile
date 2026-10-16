import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Canvas, Circle, DashPathEffect, Group, Line, Path, Rect, RoundedRect, Skia, Text, useFont, vec, LinearGradient } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Candle } from '../psx/types';
import { colors, themed } from '../theme';
import { T } from './kit';

export type ChartMode = 'candle' | 'line';
export type ChartUnit = 'intraday' | 'day' | 'week' | 'month';

const AXIS_W = 60;
const X_LABEL_H = 22;
const TICKS = 6;
const MIN_BARS = 8;
// readout box shown while inspecting (like a broker app's tooltip)
const BOX_W = 178;
const VALUE_X = 64; // values in a column after the labels
const ROW_H = 17;
const BOX_ROWS = 4;
const BOX_H = BOX_ROWS * ROW_H + 12;


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

/** Full time stamp for the readout box: "11:09 · 16 Oct", "16 Oct 2026", "Week of 12 Oct 26" or "Oct 2026". */
function stampText(t: number, unit: ChartUnit): string {
  'worklet';
  const d = new Date(t + 5 * 3600000);
  const day = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  if (unit === 'intraday') return timeText(t, unit) + '  ·  ' + day;
  if (unit === 'week') return 'Week of ' + day + ' ' + String(d.getUTCFullYear()).slice(2);
  if (unit === 'month') return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  return day + ' ' + d.getUTCFullYear();
}

function niceStep(span: number, count: number): number {
  'worklet';
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

/** A line drawn over the price (e.g. a moving average), one value per candle (null = none). */
export interface ChartLine {
  values: (number | null)[];
  color: string;
  /** a thinner, lighter line (e.g. Bollinger bands) */
  thin?: boolean;
}
/** A horizontal price level with a short label, e.g. support. */
export interface ChartLevel {
  price: number;
  label: string;
  color: string;
}
const MAX_LEVELS = 8;
const MAX_LINES = 5;
const PANE_H = 62;
const PANE_GAP = 8;

/** A marker on one candle, e.g. a golden cross. */
export interface ChartMarker {
  t: number;
  kind: 'up' | 'down';
}
/** Indicator panels under the price, aligned with `candles`. */
export interface ChartPanes {
  rsi?: (number | null)[];
  macd?: { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] };
}

interface Overlay {
  lines: number[][];
  levels: number[];
  bandLo: number;
  bandHi: number;
  /** 1 = up marker, -1 = down marker, per candle */
  marks: number[];
  rsi: number[];
  macd: number[];
  sig: number[];
  hist: number[];
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
  lines,
  levels,
  band,
  markers,
  panes,
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
  /** up to five lines over the price, aligned with `candles` */
  lines?: ChartLine[];
  /** up to eight horizontal levels */
  levels?: ChartLevel[];
  /** arrows on single candles */
  markers?: ChartMarker[];
  /** RSI and MACD panels under the price */
  panes?: ChartPanes;
  /** a shaded price range, e.g. a fair value range */
  band?: { low: number; high: number; color: string } | null;
}) {
  const font = useFont(require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'), 11);
  const fontBold = useFont(require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'), 11);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const paneList = [panes?.rsi ? ('rsi' as const) : null, panes?.macd ? ('macd' as const) : null].filter((x): x is 'rsi' | 'macd' => !!x);
  const panesH = paneList.length * (PANE_H + PANE_GAP);
  const plotBottom = height + volumeHeight + panesH;
  const total = plotBottom + X_LABEL_H;
  // where each panel starts (unused ones sit off the chart)
  const paneTopOf = (k: 'rsi' | 'macd') => (paneList.includes(k) ? height + volumeHeight + paneList.indexOf(k) * (PANE_H + PANE_GAP) + PANE_GAP : -1000);
  const rsiTop = paneTopOf('rsi');
  const macdTop = paneTopOf('macd');

  const data = useSharedValue<Series>({ t: [], o: [], h: [], l: [], c: [], v: [] });
  const W = useSharedValue(0);
  const end = useSharedValue(0); // right edge, in bars (exclusive)
  const count = useSharedValue(1); // bars across the plot
  const isLine = useSharedValue(mode === 'line' ? 1 : 0);
  const prev = useSharedValue(prevClose ?? -1);
  const cross = useSharedValue(-1); // active bar index, -1 = none
  const startEnd = useSharedValue(0);
  const startCount = useSharedValue(1);
  const ov = useSharedValue<Overlay>({ lines: [], levels: [], bandLo: -1, bandHi: -1, marks: [], rsi: [], macd: [], sig: [], hist: [] });
  const lvls = (levels ?? []).slice(0, MAX_LEVELS);
  const lns = (lines ?? []).slice(0, MAX_LINES);
  useEffect(() => {
    const num = (a?: (number | null)[]) => (a ? a.map((v) => (v == null || !isFinite(v) ? NaN : v)) : []);
    const at = new Map(candles.map((c, i) => [c.t, i]));
    const marks: number[] = new Array(candles.length).fill(0);
    for (const m of markers ?? []) {
      const i = at.get(m.t);
      if (i != null) marks[i] = m.kind === 'up' ? 1 : -1;
    }
    ov.value = {
      lines: (lines ?? []).slice(0, MAX_LINES).map((l) => num(l.values)),
      levels: (levels ?? []).slice(0, MAX_LEVELS).map((l) => l.price),
      bandLo: band ? band.low : -1,
      bandHi: band ? band.high : -1,
      marks,
      rsi: num(panes?.rsi),
      macd: num(panes?.macd?.macd),
      sig: num(panes?.macd?.signal),
      hist: num(panes?.macd?.hist),
    };
  }, [lines, levels, band, markers, panes, candles, ov]);
  const shape = useRef<{ n: number; visible: number; firstT: number | null } | null>(null);

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
    // Same series with new bars (a live refresh): keep where the user has
    // scrolled and zoomed to, following the latest bar only if they were on it.
    const was = shape.current;
    const showAll = !!was && was.visible === was.n && visible === n;
    const sameSeries = was && (was.visible === visible || showAll) && was.firstT === (candles[0]?.t ?? null) && n >= was.n;
    if (sameSeries) {
      if (showAll && count.value >= was.n - 0.5) count.value = Math.max(Math.min(n, MIN_BARS), n);
      if (end.value >= was.n - 0.5) end.value = n;
    } else {
      count.value = Math.max(Math.min(n, MIN_BARS), Math.min(n, visible));
      end.value = n;
      cross.value = -1;
      setActiveIdx(null);
    }
    shape.current = { n, visible, firstT: candles[0]?.t ?? null };
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
      // lines over the price (averages, bands) stay in view
      const ls = ov.value.lines;
      for (let k = 0; k < ls.length; k++) {
        const a = ls[k][i];
        if (a === a && a !== undefined) {
          if (a < lo) lo = a;
          if (a > hi) hi = a;
        }
      }
    }
    // a band the user asked to see (fair value) stays in view too
    if (ov.value.bandLo > 0) {
      lo = Math.min(lo, ov.value.bandLo);
      hi = Math.max(hi, ov.value.bandHi);
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
    const ma = [Skia.Path.Make(), Skia.Path.Make(), Skia.Path.Make(), Skia.Path.Make(), Skia.Path.Make()];
    const mkUp = Skia.Path.Make();
    const mkDn = Skia.Path.Make();
    const rsiP = Skia.Path.Make();
    const macdP = Skia.Path.Make();
    const sigP = Skia.Path.Make();
    const histUp = Skia.Path.Make();
    const histDn = Skia.Path.Make();
    const empty = { upBody, upWick, dnBody, dnWick, volUp, volDn, linePath, area, grid, ma, mkUp, mkDn, rsiP, macdP, sigP, histUp, histDn };
    if (g.n < 1) return empty;
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
    const o = ov.value;
    const trace = (vals: number[], path: SkPath) => {
      let pen = false;
      for (let i = g.i0; i <= g.i1; i++) {
        const v = vals[i];
        if (v === undefined || v !== v) {
          pen = false;
          continue;
        }
        const cx = x(i);
        const py = y(v);
        if (pen) path.lineTo(cx, py);
        else path.moveTo(cx, py);
        pen = true;
      }
    };
    for (let k = 0; k < o.lines.length && k < ma.length; k++) trace(o.lines[k], ma[k]);

    // arrows: up under the candle's low, down over its high
    if (o.marks.length) {
      const sz = 5;
      for (let i = g.i0; i <= g.i1; i++) {
        const m = o.marks[i];
        if (!m) continue;
        const cx = x(i);
        if (m > 0) {
          const ty = y(line ? d.c[i] : d.l[i]) + 6;
          mkUp.moveTo(cx, ty);
          mkUp.lineTo(cx - sz, ty + sz * 1.6);
          mkUp.lineTo(cx + sz, ty + sz * 1.6);
          mkUp.close();
        } else {
          const ty = y(line ? d.c[i] : d.h[i]) - 6;
          mkDn.moveTo(cx, ty);
          mkDn.lineTo(cx - sz, ty - sz * 1.6);
          mkDn.lineTo(cx + sz, ty - sz * 1.6);
          mkDn.close();
        }
      }
    }

    // RSI panel: 0–100
    if (o.rsi.length) {
      const top = rsiTop;
      const ry = (v: number) => top + 3 + ((100 - v) / 100) * (PANE_H - 6);
      let pen = false;
      for (let i = g.i0; i <= g.i1; i++) {
        const v = o.rsi[i];
        if (v === undefined || v !== v) {
          pen = false;
          continue;
        }
        if (pen) rsiP.lineTo(x(i), ry(v));
        else rsiP.moveTo(x(i), ry(v));
        pen = true;
      }
    }
    // MACD panel: centred on zero, scaled to what's on screen
    if (o.macd.length) {
      const top = macdTop;
      let m = 0;
      for (let i = g.i0; i <= g.i1; i++) {
        const a = Math.abs(o.macd[i]);
        const b = Math.abs(o.sig[i]);
        const c = Math.abs(o.hist[i]);
        if (a === a && a > m) m = a;
        if (b === b && b > m) m = b;
        if (c === c && c > m) m = c;
      }
      if (m > 0) {
        const mid = top + PANE_H / 2;
        const my = (v: number) => mid - (v / m) * (PANE_H / 2 - 3);
        const tr = (vals: number[], path: SkPath) => {
          let pen = false;
          for (let i = g.i0; i <= g.i1; i++) {
            const v = vals[i];
            if (v === undefined || v !== v) {
              pen = false;
              continue;
            }
            if (pen) path.lineTo(x(i), my(v));
            else path.moveTo(x(i), my(v));
            pen = true;
          }
        };
        tr(o.macd, macdP);
        tr(o.sig, sigP);
        for (let i = g.i0; i <= g.i1; i++) {
          const v = o.hist[i];
          if (v === undefined || v !== v) continue;
          const yy = my(v);
          (v >= 0 ? histUp : histDn).addRect({ x: x(i) - bw / 2, y: Math.min(yy, mid), width: bw, height: Math.max(1, Math.abs(mid - yy)) });
        }
      }
    }
    return { upBody, upWick, dnBody, dnWick, volUp, volDn, linePath, area, grid, ma, mkUp, mkDn, rsiP, macdP, sigP, histUp, histDn };
  });

  const upBody = useDerivedValue(() => paths.value.upBody);
  const upWick = useDerivedValue(() => paths.value.upWick);
  const dnBody = useDerivedValue(() => paths.value.dnBody);
  const dnWick = useDerivedValue(() => paths.value.dnWick);
  const volUp = useDerivedValue(() => paths.value.volUp);
  const volDn = useDerivedValue(() => paths.value.volDn);
  const linePath = useDerivedValue(() => paths.value.linePath);
  const area = useDerivedValue(() => paths.value.area);
  const maP = [0, 1, 2, 3, 4].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => paths.value.ma[k]),
  );
  const mkUp = useDerivedValue(() => paths.value.mkUp);
  const mkDn = useDerivedValue(() => paths.value.mkDn);
  const rsiP = useDerivedValue(() => paths.value.rsiP);
  const macdP = useDerivedValue(() => paths.value.macdP);
  const sigP = useDerivedValue(() => paths.value.sigP);
  const histUp = useDerivedValue(() => paths.value.histUp);
  const histDn = useDerivedValue(() => paths.value.histDn);
  // latest (or inspected) indicator values for the panel labels
  const paneIdx = useDerivedValue(() => (cross.value >= 0 ? cross.value : Math.min(geo.value.n - 1, Math.max(0, Math.ceil(geo.value.e) - 1))));
  const rsiText = useDerivedValue(() => {
    const v = ov.value.rsi[paneIdx.value];
    return v === undefined || v !== v ? 'RSI 14' : 'RSI 14   ' + v.toFixed(1);
  });
  const macdText = useDerivedValue(() => {
    const a = ov.value.macd[paneIdx.value];
    const b = ov.value.sig[paneIdx.value];
    return a === undefined || a !== a ? 'MACD 12, 26, 9' : 'MACD ' + a.toFixed(2) + '   signal ' + (b === b ? b.toFixed(2) : '–');
  });

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
  const trendColor = useDerivedValue(() => (trendUp.value === 1 ? colors.up : colors.down));
  const upOpacity = useDerivedValue(() => trendUp.value);
  const dnOpacity = useDerivedValue(() => 1 - trendUp.value);
  const plotClip = useDerivedValue(() => Skia.XYWHRect(0, 0, geo.value.plotW, height + volumeHeight));
  const paneClip = useDerivedValue(() => Skia.XYWHRect(0, height + volumeHeight, geo.value.plotW, panesH));

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
  // horizontal levels (off the chart when outside the visible price range)
  const levelY = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const p = ov.value.levels[k];
      const g = geo.value;
      return p === undefined || p < g.lo || p > g.hi ? -100 : yOf(p);
    }),
  );
  const levelP1 = levelY.map((ly) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => vec(0, ly.value)),
  );
  const levelP2 = levelY.map((ly) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => vec(geo.value.plotW, ly.value)),
  );
  // a label too close to an earlier one is hidden, so they don't print over each other
  const levelTextY = levelY.map((ly, k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const yk = ly.value;
      if (yk < 0) return -100;
      for (let j = 0; j < k; j++) {
        const yj = levelY[j].value;
        if (yj >= 0 && Math.abs(yj - yk) < 13) return -100;
      }
      return yk - 3;
    }),
  );
  const bandRect = useDerivedValue(() => {
    const o = ov.value;
    const g = geo.value;
    if (o.bandLo < 0 || o.bandHi < g.lo || o.bandLo > g.hi) return Skia.XYWHRect(0, -10, 0, 0);
    const top = yOf(Math.min(o.bandHi, g.hi));
    const bot = yOf(Math.max(o.bandLo, g.lo));
    return Skia.XYWHRect(0, top, g.plotW, Math.max(1, bot - top));
  });
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
  const crossV2 = useDerivedValue(() => vec(crossX.value, plotBottom));
  const crossH1 = useDerivedValue(() => vec(0, crossY.value));
  const crossH2 = useDerivedValue(() => vec(geo.value.plotW, crossY.value));
  const crossTagY = useDerivedValue(() => crossY.value - 10);
  const crossTextY = useDerivedValue(() => crossY.value + 4);
  const crossText = useDerivedValue(() => (cross.value < 0 ? '' : tagText(crossC.value)));
  const crossOpacity = useDerivedValue(() => (cross.value < 0 ? 0 : 1));
  // readout box: date, price, change, volume of the bar under the finger
  const boxX = useDerivedValue(() => {
    const plotW = geo.value.plotW;
    // keep the box away from the finger: left half → box on the right, and back
    return crossX.value > plotW / 2 ? 6 : Math.max(6, plotW - BOX_W - 6);
  });
  const rowY = (k: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => 6 + 6 + (k + 1) * ROW_H - 4);
  const rowYs = [rowY(0), rowY(1), rowY(2), rowY(3)];
  const labelX = useDerivedValue(() => boxX.value + 9);
  const crossRef = useDerivedValue(() => {
    const i = cross.value;
    if (i < 0) return 0;
    if (unit === 'intraday' && prev.value > 0) return prev.value;
    return i > 0 ? data.value.c[i - 1] : data.value.o[i];
  });
  const crossChg = useDerivedValue(() => (cross.value < 0 || crossRef.value <= 0 ? 0 : crossC.value / crossRef.value - 1));
  const vStamp = useDerivedValue(() => (cross.value < 0 ? '' : stampText(data.value.t[cross.value], unit)));
  const vPrice = useDerivedValue(() => (cross.value < 0 ? '' : tagText(crossC.value)));
  const vChg = useDerivedValue(() => {
    if (cross.value < 0) return '';
    const ch = crossC.value - crossRef.value;
    return (ch >= 0 ? '+' : '') + tagText(ch) + '  (' + (crossChg.value >= 0 ? '+' : '') + (crossChg.value * 100).toFixed(2) + '%)';
  });
  const vVol = useDerivedValue(() => (cross.value < 0 ? '' : fmtNum(data.value.v[cross.value] || 0, 0)));
  const chgColor = useDerivedValue(() => (crossChg.value >= 0 ? colors.up : colors.down));
  const valueX = useDerivedValue(() => boxX.value + VALUE_X);
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
              {band ? <Rect rect={bandRect} color={band.color} opacity={0.18} /> : null}
              <Group clip={plotClip}>
              <Path path={volUp} color={colors.up} opacity={0.28} />
              <Path path={volDn} color={colors.down} opacity={0.28} />
              {mode === 'line' ? (
                <Group>
                  <Path path={area} opacity={upOpacity}>
                    <LinearGradient start={gradStart} end={gradEnd} colors={[colors.upFill0, colors.fillEnd]} />
                  </Path>
                  <Path path={area} opacity={dnOpacity}>
                    <LinearGradient start={gradStart} end={gradEnd} colors={[colors.downFill0, colors.fillEnd]} />
                  </Path>
                  <Path path={linePath} style="stroke" strokeWidth={2} color={trendColor} strokeJoin="round" />
                </Group>
              ) : (
                <Group>
                  <Path path={upWick} style="stroke" strokeWidth={1} color={colors.up} />
                  <Path path={dnWick} style="stroke" strokeWidth={1} color={colors.down} />
                  <Path path={upBody} color={colors.up} />
                  <Path path={dnBody} color={colors.down} />
                </Group>
              )}
              {lns.map((l, k) => (
                <Path key={k} path={maP[k]} style="stroke" strokeWidth={l.thin ? 1 : 1.4} color={l.color} strokeJoin="round" opacity={l.thin ? 0.8 : 1} />
              ))}
              {markers?.length ? (
                <Group>
                  <Path path={mkUp} color={colors.up} />
                  <Path path={mkDn} color={colors.down} />
                </Group>
              ) : null}
              {lvls.map((l, k) => (
                <Group key={k}>
                  <Line p1={levelP1[k]} p2={levelP2[k]} color={l.color} strokeWidth={1} style="stroke" opacity={0.85}>
                    <DashPathEffect intervals={[5, 4]} />
                  </Line>
                  {font ? <Text x={4} y={levelTextY[k]} text={l.label} font={font} color={l.color} /> : null}
                </Group>
              ))}
              </Group>
              {/* indicator panels */}
              {paneList.length ? (
                <Group clip={paneClip}>
                  {panes?.rsi ? (
                    <Group>
                      <Line p1={vec(0, rsiTop)} p2={vec(4000, rsiTop)} color={colors.hairline} strokeWidth={1} style="stroke" />
                      <Line p1={vec(0, rsiTop + 3 + 0.3 * (PANE_H - 6))} p2={vec(4000, rsiTop + 3 + 0.3 * (PANE_H - 6))} color={colors.faint} strokeWidth={1} style="stroke" opacity={0.6}>
                        <DashPathEffect intervals={[3, 4]} />
                      </Line>
                      <Line p1={vec(0, rsiTop + 3 + 0.7 * (PANE_H - 6))} p2={vec(4000, rsiTop + 3 + 0.7 * (PANE_H - 6))} color={colors.faint} strokeWidth={1} style="stroke" opacity={0.6}>
                        <DashPathEffect intervals={[3, 4]} />
                      </Line>
                      <Path path={rsiP} style="stroke" strokeWidth={1.4} color={colors.gold} />
                      {font ? <Text x={4} y={rsiTop + 12} text={rsiText} font={font} color={colors.muted} /> : null}
                    </Group>
                  ) : null}
                  {panes?.macd ? (
                    <Group>
                      <Line p1={vec(0, macdTop)} p2={vec(4000, macdTop)} color={colors.hairline} strokeWidth={1} style="stroke" />
                      <Line p1={vec(0, macdTop + PANE_H / 2)} p2={vec(4000, macdTop + PANE_H / 2)} color={colors.faint} strokeWidth={1} style="stroke" opacity={0.5} />
                      <Path path={histUp} color={colors.up} opacity={0.45} />
                      <Path path={histDn} color={colors.down} opacity={0.45} />
                      <Path path={macdP} style="stroke" strokeWidth={1.3} color={colors.gold} />
                      <Path path={sigP} style="stroke" strokeWidth={1.3} color={colors.shariah} />
                      {font ? <Text x={4} y={macdTop + 12} text={macdText} font={font} color={colors.muted} /> : null}
                    </Group>
                  ) : null}
                </Group>
              ) : null}
              {font && panes?.rsi ? (
                <Group>
                  <Text x={tagTextX} y={rsiTop + 3 + 0.3 * (PANE_H - 6) + 4} text="70" font={font} color={colors.faint} />
                  <Text x={tagTextX} y={rsiTop + 3 + 0.7 * (PANE_H - 6) + 4} text="30" font={font} color={colors.faint} />
                </Group>
              ) : null}
              {/* price axis */}
              {font
                ? tickT.map((t, k) => <Text key={k} x={tagTextX} y={tickY[k]} text={t} font={font} color={colors.faint} />)
                : null}
              {/* latest price */}
              <Line p1={lastP1} p2={lastP2} color={trendColor} strokeWidth={1} style="stroke" opacity={0.6} />
              <RoundedRect x={tagX} y={lastTagY} width={AXIS_W - 4} height={20} r={5} color={trendColor} />
              {fontBold ? <Text x={tagTextX} y={lastTextY} text={lastText} font={fontBold} color={colors.onGold} /> : null}
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
                {fontBold ? <Text x={tagTextX} y={crossTextY} text={crossText} font={fontBold} color={colors.onGold} /> : null}
                <Circle cx={crossX} cy={crossY} r={4} color={colors.text} />
                <RoundedRect x={boxX} y={6} width={BOX_W} height={BOX_H} r={8} color={colors.surface} opacity={0.96} />
                <RoundedRect x={boxX} y={6} width={BOX_W} height={BOX_H} r={8} color={colors.hairline} style="stroke" strokeWidth={1} />
                {font && fontBold ? (
                  <Group>
                    <Text x={labelX} y={rowYs[0]} text={vStamp} font={fontBold} color={colors.text} />
                    <Text x={labelX} y={rowYs[1]} text="Price" font={font} color={colors.muted} />
                    <Text x={valueX} y={rowYs[1]} text={vPrice} font={fontBold} color={colors.text} />
                    <Text x={labelX} y={rowYs[2]} text="Change" font={font} color={colors.muted} />
                    <Text x={valueX} y={rowYs[2]} text={vChg} font={fontBold} color={chgColor} />
                    <Text x={labelX} y={rowYs[3]} text="Volume" font={font} color={colors.muted} />
                    <Text x={valueX} y={rowYs[3]} text={vVol} font={fontBold} color={colors.text} />
                  </Group>
                ) : null}
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

const styles = themed(() => StyleSheet.create({
  header: { minHeight: 24, justifyContent: 'center', marginBottom: 12 },
  hint: { fontSize: 11.5, color: colors.faint, textAlign: 'center', marginTop: 6, marginRight: AXIS_W / 2 },
}));

export type { SkPath };
