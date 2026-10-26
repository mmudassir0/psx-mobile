/** Saves the latest figures for the widget and redraws it. Android only; never throws. */
import React from 'react';
import { Platform } from 'react-native';
import { save } from '../storage';
import { PortfolioWidget, WIDGET_KEY, WIDGET_NAME, type WidgetData } from './PortfolioWidget';

let last = '';
export async function updateWidget(data: WidgetData) {
  if (Platform.OS !== 'android') return;
  const key = `${Math.round(data.value)}|${Math.round(data.today)}|${data.mood}|${data.nextDividend ?? ''}|${data.due ?? ''}`;
  if (key === last) return;
  last = key;
  try {
    await save(WIDGET_KEY, data);
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <PortfolioWidget data={data} /> });
  } catch {
    // no widget on the home screen, or the native part missing: nothing to do
  }
}
