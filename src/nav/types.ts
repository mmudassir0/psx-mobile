import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Side } from '../paper/engine';

export type TabParams = {
  Home: undefined;
  Market: { autoFocusSearch?: boolean; mode?: 'gainers' | 'losers' | 'active' | 'all' | 'watch' } | undefined;
  Trade: undefined;
  Portfolio: { tab?: 'real' | 'paper'; view?: 'holdings' | 'invest' | 'risk' } | undefined;
  Ideas: undefined;
  AI: undefined;
};

export type RootParams = {
  Welcome: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Stock: { symbol: string };
  Index: { code: string };
  Order: { symbol: string; side?: Side };
  Settings: undefined;
  Picks: undefined;
  EditHoldings: undefined;
  Record: undefined;
  Dividends: undefined;
  Summary: undefined;
  Alerts: { symbol?: string } | undefined;
  News: undefined;
  Find: undefined;
  Compare: { symbols?: string[] } | undefined;
  Income: undefined;
  Rebalance: { cash?: number | string } | undefined;
  WhatIf: undefined;
  TaxStatement: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootParams {}
  }
}
