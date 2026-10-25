/** Runs in the background when Android asks the widget to draw itself (added, resized, every 30 minutes). */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { load } from '../storage';
import { PortfolioWidget, WIDGET_KEY, type WidgetData } from './PortfolioWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await load<WidgetData | null>(WIDGET_KEY, null).catch(() => null);
      props.renderWidget(<PortfolioWidget data={data} />);
      break;
    }
    default:
      break;
  }
}
