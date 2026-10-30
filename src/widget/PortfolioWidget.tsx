/** Home screen widget: your portfolio value, today's change, the next payout and any reminder. Tap to open Sahm. */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { LOOKS, softOf, stamp, toneOf, WF, type Look } from './look';

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

/** Small caps label, the app's section style */
export function Label({ text, L }: { text: string; L: Look }) {
  return <TextWidget text={text.toUpperCase()} style={{ fontSize: 10.5, letterSpacing: 1.2, color: L.muted, fontFamily: WF.semi }} />;
}

export function PortfolioWidget({ data, look = LOOKS.dark }: { data: WidgetData | null; look?: Look }) {
  const L = look;
  const moodTone = data?.mood == null ? L.muted : data.mood < 45 ? L.down : data.mood <= 55 ? L.gold : L.up;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Sahm portfolio"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: L.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: L.gold, marginRight: 6 }} />
          <Label text="My portfolio" L={L} />
        </FlexWidget>
        <TextWidget text={data?.mood != null ? `Mood ${data.mood}` : data ? stamp(data.at) : ''} style={{ fontSize: 11, color: moodTone, fontFamily: WF.semi }} />
      </FlexWidget>

      {data ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text={data.hidden ? pct(data.todayPct) : `Rs ${fmt(data.value)}`}
            style={{ fontSize: 26, color: data.hidden ? toneOf(L, data.today) : L.text, fontFamily: WF.mono, adjustsFontSizeToFit: true }}
            maxLines={1}
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <FlexWidget style={{ backgroundColor: softOf(L, data.today), borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 }}>
              <TextWidget text={data.hidden ? `Today ${pct(data.todayPct)}` : `${signed(data.today)}  ${pct(data.todayPct)}`} style={{ fontSize: 12, color: toneOf(L, data.today), fontFamily: WF.mono }} />
            </FlexWidget>
            <TextWidget text={`All ${pct(data.pnlPct)}`} style={{ fontSize: 12, color: L.muted, fontFamily: WF.mono }} />
          </FlexWidget>
        </FlexWidget>
      ) : (
        <TextWidget text="Open Sahm once to show your portfolio here" style={{ fontSize: 13, color: L.text2, fontFamily: WF.semi }} maxLines={2} />
      )}

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget style={{ height: 1, width: 'match_parent', backgroundColor: L.line, marginBottom: 6 }} />
        {data?.due ? (
          <TextWidget text={data.due} style={{ fontSize: 12, color: L.gold, fontFamily: WF.semi }} maxLines={1} />
        ) : data?.nextDividend ? (
          <TextWidget text={`Next payout · ${data.nextDividend}`} style={{ fontSize: 12, color: L.text2, fontFamily: WF.semi }} maxLines={1} />
        ) : (
          <TextWidget text={data ? (data.hidden ? 'Amounts hidden: app lock is on' : `Updated ${stamp(data.at)}`) : ' '} style={{ fontSize: 11.5, color: L.muted, fontFamily: WF.semi }} maxLines={1} />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
