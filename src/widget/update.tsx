/** Saves the latest figures for the widgets and redraws them. Android only; never throws. */
import React from 'react';
import { Platform } from 'react-native';
import { load, save } from '../storage';
import { PortfolioWidget, WIDGET_KEY, WIDGET_NAME, type WidgetData } from './PortfolioWidget';
import { LOOK_KEY, lookFor } from './look';

const currentLook = async () => lookFor(await load<string | null>(LOOK_KEY, null));

let last = '';
export async function updateWidget(data: WidgetData) {
  if (Platform.OS !== 'android') return;
  const key = `${Math.round(data.value)}|${Math.round(data.today)}|${data.mood}|${data.nextDividend ?? ''}|${data.due ?? ''}|${data.hidden ? 1 : 0}`;
  if (key === last) return;
  last = key;
  try {
    await save(WIDGET_KEY, data);
    const look = await currentLook();
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <PortfolioWidget data={data} look={look} /> });
  } catch {
    // no widget on the home screen, or the native part missing: nothing to do
  }
}

/** After the app refreshes prices: redraw the watchlist and market widgets with them. */
let lastMarket = '';
export async function updateMarketWidgets(watch: import('./MarketWidgets').WatchData, market: import('./MarketWidgets').MarketData) {
  if (Platform.OS !== 'android') return;
  const key = JSON.stringify([watch.rows, market.rows]);
  if (key === lastMarket) return;
  lastMarket = key;
  try {
    const { WATCH_KEY, MARKET_KEY, WATCH_WIDGET, MARKET_WIDGET, WatchWidget, MarketWidget, rowsFor } = await import('./MarketWidgets');
    await save(WATCH_KEY, watch);
    await save(MARKET_KEY, market);
    const look = await currentLook();
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    await requestWidgetUpdate({ widgetName: WATCH_WIDGET, renderWidget: (info) => <WatchWidget data={watch} rows={rowsFor(info.height)} look={look} /> }).catch(() => {});
    await requestWidgetUpdate({ widgetName: MARKET_WIDGET, renderWidget: () => <MarketWidget data={market} look={look} /> }).catch(() => {});
  } catch {
    // widgets not on the home screen
  }
}

/** From the stock page: show this stock on the stock widget, drawn straight away. */
export async function pinStockWidget(symbol: string, name: string): Promise<void> {
  const { STOCK_PICK_KEY, STOCK_WIDGET, StockWidget } = await import('./StockWidget');
  await save(STOCK_PICK_KEY, { symbol, name });
  if (Platform.OS !== 'android') return;
  try {
    const { freshStock } = await import('./marketData');
    const data = await freshStock();
    const look = await currentLook();
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    await requestWidgetUpdate({ widgetName: STOCK_WIDGET, renderWidget: (info) => <StockWidget data={data} width={info.width} look={look} /> });
  } catch {
    // no stock widget on the home screen yet
  }
}

/** The app switched between light and dark: save it for the widgets and redraw them all from what's saved. */
export async function setWidgetLook(name: 'dark' | 'light'): Promise<void> {
  if (Platform.OS !== 'android') return;
  const before = await load<string | null>(LOOK_KEY, null);
  if (before === name) return;
  await save(LOOK_KEY, name);
  try {
    const look = lookFor(name);
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { WATCH_KEY, MARKET_KEY, WATCH_WIDGET, MARKET_WIDGET, WatchWidget, MarketWidget, rowsFor } = await import('./MarketWidgets');
    const { STOCK_KEY, STOCK_WIDGET, StockWidget } = await import('./StockWidget');
    const [p, w, m, s] = await Promise.all([load<WidgetData | null>(WIDGET_KEY, null), load(WATCH_KEY, null), load(MARKET_KEY, null), load(STOCK_KEY, null)]);
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <PortfolioWidget data={p} look={look} /> }).catch(() => {});
    await requestWidgetUpdate({ widgetName: WATCH_WIDGET, renderWidget: (info) => <WatchWidget data={w} rows={rowsFor(info.height)} look={look} /> }).catch(() => {});
    await requestWidgetUpdate({ widgetName: MARKET_WIDGET, renderWidget: () => <MarketWidget data={m} look={look} /> }).catch(() => {});
    await requestWidgetUpdate({ widgetName: STOCK_WIDGET, renderWidget: (info) => <StockWidget data={s} width={info.width} look={look} /> }).catch(() => {});
  } catch {
    // no widgets placed
  }
}
