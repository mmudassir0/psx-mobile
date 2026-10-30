/** Home screen widget for one stock you choose in Sahm (stock page → "Show on widget"): price, today's change and a 3-month chart. */
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { sparkPath } from './spark';
import { LOOKS, softOf, stamp, toneOf, WF, type Look } from './look';
import { Label } from './PortfolioWidget';

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

export function StockWidget({ data, width = 250, look = LOOKS.dark }: { data: StockWidgetData | null; width?: number; look?: Look }) {
  const L = look;
  const color = toneOf(L, data?.changePct ?? 0);
  const w = Math.max(120, Math.min(400, width - 32));
  const svg =
    data && data.closes.length > 2
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44" viewBox="0 0 ${w} 44"><path d="${sparkPath(data.closes, w, 44)}" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>`
      : null;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: data ? `sahm://stock/${data.symbol}` : 'sahm://market' }}
      accessibilityLabel={data ? `Sahm ${data.symbol}` : 'Sahm stock'}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: L.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      {!data ? (
        <TextWidget text="Open a stock in Sahm and tap “Show on the stock widget”" style={{ fontSize: 13, color: L.text2, fontFamily: WF.semi }} maxLines={3} />
      ) : (
        <>
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
            <TextWidget text={data.symbol} style={{ fontSize: 16, color: L.text, fontFamily: WF.heavy }} />
            <TextWidget text={stamp(data.at)} style={{ fontSize: 11, color: L.muted, fontFamily: WF.semi }} />
          </FlexWidget>
          <Label text={data.name} L={L} />
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'center' }}>
            <TextWidget text={data.price != null ? data.price.toFixed(2) : '–'} style={{ fontSize: 22, color: L.text, fontFamily: WF.mono }} />
            {data.changePct != null ? (
              <FlexWidget style={{ backgroundColor: softOf(L, data.changePct), borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <TextWidget text={`${data.changePct >= 0 ? '+' : '−'}${Math.abs(data.changePct).toFixed(2)}%`} style={{ fontSize: 12.5, color, fontFamily: WF.mono }} />
              </FlexWidget>
            ) : null}
          </FlexWidget>
          {svg ? <SvgWidget svg={svg} style={{ width: w, height: 44 }} /> : null}
        </>
      )}
    </FlexWidget>
  );
}
