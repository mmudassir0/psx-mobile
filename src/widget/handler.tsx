/** Runs in the background when Android asks a widget to draw itself (added, resized, every 30 minutes). */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { load } from '../storage';
import { PortfolioWidget, WIDGET_KEY, type WidgetData } from './PortfolioWidget';
import { MARKET_KEY, MARKET_WIDGET, MarketWidget, rowsFor, WATCH_KEY, WATCH_WIDGET, WatchWidget, type MarketData, type WatchData } from './MarketWidgets';
import { freshMarket, freshStock, freshWatch } from './marketData';
import { STOCK_KEY, STOCK_WIDGET, StockWidget, type StockWidgetData } from './StockWidget';
import { LOOK_KEY, lookFor } from './look';
import { isMarketOpen, lastSessionEnd } from '../market-hours';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const name = props.widgetInfo.widgetName;
      const look = lookFor(await load<string | null>(LOOK_KEY, null).catch(() => null));
      // outside market hours the saved figures are already the last ones: no download needed
      // (except when the widget is first placed, or it has nothing yet)
      const stale = (saved: { at: number } | null) => props.widgetAction !== 'WIDGET_UPDATE' || isMarketOpen() || !saved || saved.at < lastSessionEnd();
      if (name === WATCH_WIDGET) {
        const rows = rowsFor(props.widgetInfo.height);
        // draw what's saved straight away, then the fresh prices
        const saved = await load<WatchData | null>(WATCH_KEY, null).catch(() => null);
        props.renderWidget(<WatchWidget data={saved} rows={rows} look={look} />);
        if (!stale(saved)) break;
        const fresh = await freshWatch().catch(() => null);
        if (fresh) props.renderWidget(<WatchWidget data={fresh} rows={rows} look={look} />);
      } else if (name === STOCK_WIDGET) {
        const w = props.widgetInfo.width;
        const saved = await load<StockWidgetData | null>(STOCK_KEY, null).catch(() => null);
        props.renderWidget(<StockWidget data={saved} width={w} look={look} />);
        if (!stale(saved)) break;
        const fresh = await freshStock().catch(() => null);
        if (fresh) props.renderWidget(<StockWidget data={fresh} width={w} look={look} />);
      } else if (name === MARKET_WIDGET) {
        const saved = await load<MarketData | null>(MARKET_KEY, null).catch(() => null);
        props.renderWidget(<MarketWidget data={saved} look={look} />);
        if (!stale(saved)) break;
        const fresh = await freshMarket().catch(() => null);
        if (fresh) props.renderWidget(<MarketWidget data={fresh} look={look} />);
      } else {
        const data = await load<WidgetData | null>(WIDGET_KEY, null).catch(() => null);
        props.renderWidget(<PortfolioWidget data={data} look={look} />);
      }
      break;
    }
    default:
      break;
  }
}
