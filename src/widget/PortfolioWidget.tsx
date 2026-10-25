/** Home screen widget: your portfolio value, today's change and the market mood. Tap to open Sahm. */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export interface WidgetData {
  value: number;
  today: number;
  todayPct: number;
  pnlPct: number;
  mood: number | null;
  moodLabel: string | null;
  /** epoch ms the figures are from */
  at: number;
}

export const WIDGET_KEY = 'widget.data';
export const WIDGET_NAME = 'Portfolio';

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}%`;
const time = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export function PortfolioWidget({ data }: { data: WidgetData | null }) {
  const up = (data?.today ?? 0) >= 0;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Sahm portfolio"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#161E29', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="Sahm · My portfolio" style={{ fontSize: 12, color: '#97A3B2' }} />
        <TextWidget text={data ? time(data.at) : ''} style={{ fontSize: 11, color: '#7B8797' }} />
      </FlexWidget>
      {data ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={`Rs ${fmt(data.value)}`} style={{ fontSize: 24, fontWeight: 'bold', color: '#EDF1F5' }} />
          <TextWidget text={`Today ${signed(data.today)} (${pct(data.todayPct)}) · All ${pct(data.pnlPct)}`} style={{ fontSize: 12.5, color: up ? '#22C38E' : '#FF8590' }} />
        </FlexWidget>
      ) : (
        <TextWidget text="Open Sahm once to show your portfolio here" style={{ fontSize: 13, color: '#C3CCD6' }} maxLines={2} />
      )}
      <TextWidget
        text={data?.mood != null ? `Market mood ${data.mood} · ${data.moodLabel}` : ' '}
        style={{ fontSize: 12, color: data?.mood == null ? '#7B8797' : data.mood < 45 ? '#FF8590' : data.mood <= 55 ? '#E8B04B' : '#22C38E' }}
      />
    </FlexWidget>
  );
}
