/** Two more home screen widgets: your watchlist's prices, and the main indices. Both fetch fresh figures from PSX when Android redraws them. */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { rowsFor } from './rows';
import { LOOKS, softOf, stamp, toneOf, WF, type Look } from './look';
import { Label } from './PortfolioWidget';
export { rowsFor };

export interface WatchRow {
  symbol: string;
  price: number | null;
  changePct: number | null;
}
export interface WatchData {
  rows: WatchRow[];
  at: number;
}
export interface MarketRow {
  code: string;
  label: string;
  value: number | null;
  change: number | null;
  changePct: number | null;
}
export interface MarketData {
  rows: MarketRow[];
  up?: number;
  down?: number;
  at: number;
}

export const WATCH_WIDGET = 'Watchlist';
export const MARKET_WIDGET = 'Market';
export const WATCH_KEY = 'widget.watch';
export const MARKET_KEY = 'widget.market';

const pct = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const num = (v: number | null, d = 2) => (v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));

function Shell({ title, at, children, label, L }: { title: string; at: number | null; children: React.ReactNode; label: string; L: Look }) {
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={label} style={{ height: 'match_parent', width: 'match_parent', backgroundColor: L.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'column' }}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent', marginBottom: 6 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: L.gold, marginRight: 6 }} />
          <Label text={title} L={L} />
        </FlexWidget>
        <TextWidget text={at ? stamp(at) : ''} style={{ fontSize: 11, color: L.muted, fontFamily: WF.semi }} />
      </FlexWidget>
      {children}
    </FlexWidget>
  );
}

function Line({ left, mid, change, L, last }: { left: string; mid: string; change: number | null; L: Look; last?: boolean }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
        <TextWidget text={left} style={{ fontSize: 13.5, color: L.text, fontFamily: WF.heavy }} maxLines={1} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={mid} style={{ fontSize: 13, color: L.text, fontFamily: WF.mono }} />
          <FlexWidget style={{ backgroundColor: softOf(L, change), borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 8, width: 66, alignItems: 'flex-end' }}>
            <TextWidget text={pct(change)} style={{ fontSize: 12, color: toneOf(L, change), fontFamily: WF.mono }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
      {last ? null : <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: L.line }} />}
    </FlexWidget>
  );
}

export function WatchWidget({ data, rows = 5, look = LOOKS.dark }: { data: WatchData | null; rows?: number; look?: Look }) {
  const L = look;
  const shown = data?.rows.slice(0, rows) ?? [];
  return (
    <Shell title="Watchlist" at={data?.at ?? null} label="Sahm watchlist" L={L}>
      {!data || !data.rows.length ? (
        <TextWidget text={data ? 'Add stocks to your watchlist in Sahm' : 'Open Sahm once to show your watchlist here'} style={{ fontSize: 13, color: L.text2, fontFamily: WF.semi }} maxLines={2} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {shown.map((r, i) => (
            <Line key={r.symbol} left={r.symbol} mid={num(r.price)} change={r.changePct} L={L} last={i === shown.length - 1} />
          ))}
        </FlexWidget>
      )}
    </Shell>
  );
}

export function MarketWidget({ data, look = LOOKS.dark }: { data: MarketData | null; look?: Look }) {
  const L = look;
  const up = data?.up ?? 0;
  const down = data?.down ?? 0;
  const total = up + down;
  return (
    <Shell title="Market" at={data?.at ?? null} label="Sahm market" L={L}>
      {!data || !data.rows.length ? (
        <TextWidget text="Open Sahm once to show the market here" style={{ fontSize: 13, color: L.text2, fontFamily: WF.semi }} maxLines={2} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {data.rows.map((r, i) => (
            <Line key={r.code} left={r.label} mid={num(r.value, 0)} change={r.changePct} L={L} last={i === data.rows.length - 1} />
          ))}
          {total > 0 ? (
            <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 6 }}>
              {/* breadth: how many shares rose against fell, as one split bar */}
              <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 4, borderRadius: 2 }}>
                <FlexWidget style={{ flex: Math.max(1, up), height: 4, backgroundColor: L.up, borderRadius: 2 }} />
                <FlexWidget style={{ width: 2, height: 4 }} />
                <FlexWidget style={{ flex: Math.max(1, down), height: 4, backgroundColor: L.down, borderRadius: 2 }} />
              </FlexWidget>
              <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', marginTop: 3 }}>
                <TextWidget text={`${up} up`} style={{ fontSize: 11, color: L.up, fontFamily: WF.semi }} />
                <TextWidget text={`${down} down`} style={{ fontSize: 11, color: L.down, fontFamily: WF.semi }} />
              </FlexWidget>
            </FlexWidget>
          ) : null}
        </FlexWidget>
      )}
    </Shell>
  );
}
