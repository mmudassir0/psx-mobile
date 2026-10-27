/** Runs in the background when Android asks a widget to draw itself (added, resized, every 30 minutes). */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { load } from '../storage';
import { PortfolioWidget, WIDGET_KEY, type WidgetData } from './PortfolioWidget';
import { MARKET_KEY, MARKET_WIDGET, MarketWidget, rowsFor, WATCH_KEY, WATCH_WIDGET, WatchWidget, type MarketData, type WatchData } from './MarketWidgets';
import { freshMarket, freshStock, freshWatch } from './marketData';
import { STOCK_KEY, STOCK_WIDGET, StockWidget, type StockWidgetData } from './StockWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const name = props.widgetInfo.widgetName;
      if (name === WATCH_WIDGET) {
        const rows = rowsFor(props.widgetInfo.height);
        // draw what's saved straight away, then the fresh prices
        props.renderWidget(<WatchWidget data={await load<WatchData | null>(WATCH_KEY, null).catch(() => null)} rows={rows} />);
        const fresh = await freshWatch().catch(() => null);
        if (fresh) props.renderWidget(<WatchWidget data={fresh} rows={rows} />);
      } else if (name === STOCK_WIDGET) {
        const w = props.widgetInfo.width;
        props.renderWidget(<StockWidget data={await load<StockWidgetData | null>(STOCK_KEY, null).catch(() => null)} width={w} />);
        const fresh = await freshStock().catch(() => null);
        if (fresh) props.renderWidget(<StockWidget data={fresh} width={w} />);
      } else if (name === MARKET_WIDGET) {
        props.renderWidget(<MarketWidget data={await load<MarketData | null>(MARKET_KEY, null).catch(() => null)} />);
        const fresh = await freshMarket().catch(() => null);
        if (fresh) props.renderWidget(<MarketWidget data={fresh} />);
      } else {
        const data = await load<WidgetData | null>(WIDGET_KEY, null).catch(() => null);
        props.renderWidget(<PortfolioWidget data={data} />);
      }
      break;
    }
    default:
      break;
  }
}
