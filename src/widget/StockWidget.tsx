/** Home screen widget for one stock you choose in Sahm (stock page → "Show on widget"): price, today's change and a 3-month chart. */
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { sparkPath } from './spark';

export interface StockWidgetData {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  /** closes, oldest first */
  closes: number[];
  at: number;
}

export const STOCK_WIDGET = 'Stock';
export const STOCK_KEY = 'widget.stock';
/** which stock the widget shows */
export const STOCK_PICK_KEY = 'widget.stockPick';

const time = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export function StockWidget({ data, width = 250 }: { data: StockWidgetData | null; width?: number }) {
  const up = (data?.changePct ?? 0) >= 0;
  const color = up ? '#22C38E' : '#FF8590';
  const w = Math.max(120, Math.min(400, width - 28));
  const svg = data && data.closes.length > 2 ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44" viewBox="0 0 ${w} 44"><path d="${sparkPath(data.closes, w, 44)}" stroke="${color}" stroke-width="2" fill="none"/></svg>` : null;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data ? `sahm://stock/${data.symbol}` : 'sahm://market' }}
      accessibilityLabel={data ? `Sahm ${data.symbol}` : 'Sahm stock'}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#161E29', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      {!data ? (
        <TextWidget text="Open a stock in Sahm and tap “Show on widget”" style={{ fontSize: 13, color: '#C3CCD6' }} maxLines={3} />
      ) : (
        <>
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text={data.symbol} style={{ fontSize: 15, fontWeight: 'bold', color: '#EDF1F5' }} />
            <TextWidget text={time(data.at)} style={{ fontSize: 11, color: '#7B8797' }} />
          </FlexWidget>
          <TextWidget text={data.name} style={{ fontSize: 11.5, color: '#97A3B2' }} maxLines={1} />
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
            <TextWidget text={data.price != null ? `Rs ${data.price.toFixed(2)}` : '–'} style={{ fontSize: 22, fontWeight: 'bold', color: '#EDF1F5' }} />
            <TextWidget text={data.changePct != null ? `${up ? '+' : '−'}${Math.abs(data.changePct).toFixed(2)}%` : ''} style={{ fontSize: 15, color }} />
          </FlexWidget>
          {svg ? <SvgWidget svg={svg} style={{ width: w, height: 44 }} /> : null}
        </>
      )}
    </FlexWidget>
  );
}
