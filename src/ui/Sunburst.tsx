/**
 * The market as rings: the index in the middle, its sectors around it and
 * their stocks on the outside, each slice sized by market value and coloured
 * by the move. Tap a stock slice to open it, a sector to zoom into it.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Text as SvgText, Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';
import type { Stock } from '../psx/types';
import { T } from './kit';

interface Arc {
  a0: number;
  a1: number;
}

const TAU = Math.PI * 2;
const pt = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];

function arcPath(cx: number, cy: number, rin: number, rout: number, a0: number, a1: number): string {
  // a full circle can't be drawn as one arc: split it
  if (a1 - a0 >= TAU - 1e-6) a1 = a0 + TAU - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(cx, cy, rout, a0);
  const [x1, y1] = pt(cx, cy, rout, a1);
  const [x2, y2] = pt(cx, cy, rin, a1);
  const [x3, y3] = pt(cx, cy, rin, a0);
  return `M${x0} ${y0}A${rout} ${rout} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${rin} ${rin} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** Text placed along the radius in the middle of a slice, turned so it never reads upside down. */
function radialLabel(cx: number, cy: number, r: number, a: number) {
  const [x, y] = pt(cx, cy, r, a);
  let deg = (a * 180) / Math.PI - 90;
  if (a > Math.PI) deg += 180;
  return { x, y, deg };
}

export function Sunburst({
  stocks,
  group,
  move,
  color,
  center,
  size,
  onStock,
}: {
  stocks: Stock[];
  group: (s: Stock) => string;
  move: (s: Stock) => number | null;
  color: (v: number | null) => string;
  /** label and move for the middle */
  center: { label: string; move: number | null };
  size: number;
  onStock: (symbol: string) => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const cap = (s: Stock) => s.marketCap ?? 0;
  const list = stocks.filter((s) => cap(s) > 0 && (!zoom || group(s) === zoom));
  const total = list.reduce((a, s) => a + cap(s), 0);
  if (!total || size <= 0) return <View style={{ height: size }} />;

  const groups = new Map<string, Stock[]>();
  for (const s of list) groups.set(group(s), [...(groups.get(group(s)) ?? []), s]);
  const ordered = [...groups.entries()].map(([g, ss]) => ({ g, ss: ss.sort((a, b) => cap(b) - cap(a)), sum: ss.reduce((a, s) => a + cap(s), 0) })).sort((a, b) => b.sum - a.sum);

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 2;
  const r0 = R * 0.3;
  const r1 = R * 0.62;
  const weighted = (ss: Stock[]) => {
    const t = ss.reduce((a, s) => a + cap(s), 0);
    return t ? ss.reduce((a, s) => a + (move(s) ?? 0) * cap(s), 0) / t : null;
  };

  let a = 0;
  const sectors: (Arc & { g: string; move: number | null; stocks: (Arc & { s: Stock })[] })[] = [];
  for (const o of ordered) {
    const span = (o.sum / total) * TAU;
    let b = a;
    const ss = o.ss.map((s) => {
      const w = (cap(s) / total) * TAU;
      const arc = { a0: b, a1: b + w, s };
      b += w;
      return arc;
    });
    sectors.push({ a0: a, a1: a + span, g: o.g, move: weighted(o.ss), stocks: ss });
    a += span;
  }
  const centerMove = zoom || center.move == null ? weighted(list) : center.move;
  const fmt = (v: number | null) => (v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg width={size} height={size}>
        <G>
          {sectors.map((sec) =>
            sec.stocks.map((st) => {
              const v = move(st.s);
              const span = st.a1 - st.a0;
              const lab = span * (R - 6) > 13 && R - r1 > 30 ? radialLabel(cx, cy, (r1 + R) / 2, (st.a0 + st.a1) / 2) : null;
              return (
                <G key={st.s.symbol} onPress={() => onStock(st.s.symbol)}>
                  <Path d={arcPath(cx, cy, r1, R, st.a0, st.a1)} fill={color(v)} stroke={colors.ground} strokeWidth={span * R > 3 ? 0.8 : 0.3} />
                  {lab ? (
                    <SvgText x={lab.x} y={lab.y} fill={colors.text} fontSize={Math.min(12, Math.max(8.5, span * R * 0.55))} fontFamily={fonts.bold} textAnchor="middle" alignmentBaseline="middle" transform={`rotate(${lab.deg} ${lab.x} ${lab.y})`}>
                      {st.s.symbol}
                    </SvgText>
                  ) : null}
                </G>
              );
            }),
          )}
          {sectors.map((sec) => {
            const span = sec.a1 - sec.a0;
            const mid = (sec.a0 + sec.a1) / 2;
            // a sector name fits along its arc only when the slice is wide enough
            const lab = span * ((r0 + r1) / 2) > 34 ? radialLabel(cx, cy, (r0 + r1) / 2, mid) : null;
            // the name runs along the radius, so it must fit the ring's depth (about 6px a letter at 11pt)
            const fit = Math.max(4, Math.floor((r1 - r0 - 8) / 6.2));
            const name = sec.g.length > fit ? sec.g.slice(0, fit - 1).trimEnd() + '…' : sec.g;
            return (
              <G key={sec.g} onPress={() => setZoom(zoom ? null : sec.g)}>
                <Path d={arcPath(cx, cy, r0, r1, sec.a0, sec.a1)} fill={color(sec.move)} stroke={colors.ground} strokeWidth={1.2} />
                {lab ? (
                  <SvgText x={lab.x} y={lab.y} fill={colors.text} fontSize={11} fontFamily={fonts.semibold} textAnchor="middle" alignmentBaseline="middle" transform={`rotate(${lab.deg} ${lab.x} ${lab.y})`}>
                    {name}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
          <G onPress={() => setZoom(null)}>
            <Circle cx={cx} cy={cy} r={r0 - 1} fill={color(centerMove)} />
            <SvgText x={cx} y={cy - 7} fill={colors.text} fontSize={13} fontFamily={fonts.bold} textAnchor="middle">
              {zoom ? (zoom.length > 14 ? zoom.slice(0, 13) + '…' : zoom) : center.label}
            </SvgText>
            <SvgText x={cx} y={cy + 11} fill={colors.text} fontSize={12} fontFamily={fonts.semibold} textAnchor="middle">
              {fmt(centerMove)}
            </SvgText>
          </G>
        </G>
      </Svg>
      <T v="caption">{zoom ? 'Tap the middle to see every sector again' : 'Tap a sector to zoom in, a stock to open it'}</T>
    </View>
  );
}
