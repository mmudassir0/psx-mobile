/** Two more home screen widgets: your watchlist's prices, and the main indices. Both fetch fresh figures from PSX when Android redraws them. */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { rowsFor } from './rows';
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

const BG = '#161E29' as const;
const UP = '#22C38E' as const;
const DOWN = '#FF8590' as const;
const MUTED = '#7B8797' as const;
const TEXT = '#EDF1F5' as const;
const time = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const pct = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const num = (v: number | null, d = 2) => (v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const tone = (v: number | null) => (v == null || v === 0 ? MUTED : v > 0 ? UP : DOWN);

function Shell({ title, at, children, label }: { title: string; at: number | null; children: React.ReactNode; label: string }) {
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={label} style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 20, padding: 14, flexDirection: 'column' }}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent', marginBottom: 6 }}>
        <TextWidget text={title} style={{ fontSize: 12, color: '#97A3B2' }} />
        <TextWidget text={at ? time(at) : ''} style={{ fontSize: 11, color: MUTED }} />
      </FlexWidget>
      {children}
    </FlexWidget>
  );
}

function Line({ left, mid, right, color }: { left: string; mid: string; right: string; color: `#${string}` }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', paddingVertical: 3 }}>
      <TextWidget text={left} style={{ fontSize: 13.5, fontWeight: 'bold', color: TEXT }} />
      <FlexWidget style={{ flexDirection: 'row' }}>
        <TextWidget text={mid} style={{ fontSize: 13.5, color: TEXT }} />
        <TextWidget text={`  ${right}`} style={{ fontSize: 13, color }} />
      </FlexWidget>
    </FlexWidget>
  );
}


export function WatchWidget({ data, rows = 5 }: { data: WatchData | null; rows?: number }) {
  return (
    <Shell title="Sahm · Watchlist" at={data?.at ?? null} label="Sahm watchlist">
      {!data || !data.rows.length ? (
        <TextWidget text={data ? 'Add stocks to your watchlist in Sahm' : 'Open Sahm once to show your watchlist here'} style={{ fontSize: 13, color: '#C3CCD6' }} maxLines={2} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {data.rows.slice(0, rows).map((r) => (
            <Line key={r.symbol} left={r.symbol} mid={num(r.price)} right={pct(r.changePct)} color={tone(r.changePct)} />
          ))}
        </FlexWidget>
      )}
    </Shell>
  );
}

export function MarketWidget({ data }: { data: MarketData | null }) {
  return (
    <Shell title="Sahm · Market" at={data?.at ?? null} label="Sahm market">
      {!data || !data.rows.length ? (
        <TextWidget text="Open Sahm once to show the market here" style={{ fontSize: 13, color: '#C3CCD6' }} maxLines={2} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {data.rows.map((r) => (
            <Line key={r.code} left={r.label} mid={num(r.value, 0)} right={pct(r.changePct)} color={tone(r.changePct)} />
          ))}
          {data.up != null && data.down != null ? <TextWidget text={`${data.up} up · ${data.down} down`} style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }} /> : null}
        </FlexWidget>
      )}
    </Shell>
  );
}
