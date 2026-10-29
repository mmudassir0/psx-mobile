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
  /** the next cash dividend on your holdings, e.g. "MEBL Rs 1,200 · book closure 4 Nov" */
  nextDividend?: string | null;
  /** a reminder that's due, e.g. "Check your note on LUCK" */
  due?: string | null;
  /** the app lock is on: show percentages, not rupees */
  hidden?: boolean;
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
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#16181B', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="Sahm · My portfolio" style={{ fontSize: 12, color: '#A3A39C' }} />
        <TextWidget
          text={data?.mood != null ? `Mood ${data.mood} ${data.moodLabel ?? ''}` : data ? time(data.at) : ''}
          style={{ fontSize: 11.5, color: data?.mood == null ? '#8C8D86' : data.mood < 45 ? '#F08A79' : data.mood <= 55 ? '#D9B762' : '#4CC48A' }}
        />
      </FlexWidget>
      {data ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={data.hidden ? `Today ${pct(data.todayPct)}` : `Rs ${fmt(data.value)}`} style={{ fontSize: 24, fontWeight: 'bold', color: data.hidden ? (up ? '#4CC48A' : '#F08A79') : '#F2F0EA' }} />
          <TextWidget
            text={data.hidden ? `All ${pct(data.pnlPct)} · amounts hidden (app lock on)` : `Today ${signed(data.today)} (${pct(data.todayPct)}) · All ${pct(data.pnlPct)}`}
            style={{ fontSize: 12.5, color: data.hidden ? '#A3A39C' : up ? '#4CC48A' : '#F08A79' }}
          />
        </FlexWidget>
      ) : (
        <TextWidget text="Open Sahm once to show your portfolio here" style={{ fontSize: 13, color: '#C3CCD6' }} maxLines={2} />
      )}
      {data?.nextDividend ? <TextWidget text={`💸 ${data.nextDividend}`} style={{ fontSize: 12, color: '#C3CCD6' }} maxLines={1} /> : null}
      <TextWidget text={data?.due ? `⏰ ${data.due}` : data ? `Updated ${time(data.at)}` : ' '} style={{ fontSize: 12, color: data?.due ? '#D9B762' : '#8C8D86' }} maxLines={1} />
    </FlexWidget>
  );
}
