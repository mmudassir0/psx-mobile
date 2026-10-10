import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Side } from '../paper/engine';

export type TabParams = {
  Home: undefined;
  Market: undefined;
  Trade: undefined;
  Portfolio: undefined;
  AI: undefined;
};

export type RootParams = {
  Welcome: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Stock: { symbol: string };
  Order: { symbol: string; side?: Side };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootParams {}
  }
}
