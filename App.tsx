import React, { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { colors, fonts } from './src/theme';
import type { RootParams, TabParams } from './src/nav/types';
import { MarketProvider } from './src/store/market';
import { setStorage } from './src/psx/cache';
import { diskStore } from './src/psx/diskStore';
import { UserProvider, useUser } from './src/store/user';
import { UpdateProvider } from './src/store/update';
import { ThemeProvider, useTheme } from './src/store/theme';
import { AiProvider } from './src/store/ai';
import PicksScreen from './src/screens/PicksScreen';
import { layoutPref, TABS_FOR } from './src/nav/layout';
import { useFlags } from './src/flags';
import { MenuButton } from './src/ui/SideMenu';
import { ScreenBoundary } from './src/ui/ScreenBoundary';
import { Icon, IconName } from './src/ui/kit';
import WelcomeScreen from './src/screens/WelcomeScreen';
import HomeScreen from './src/screens/HomeScreen';
import { loadLiveFundamentals } from './src/psx/fundamentals';
import { maybeBackup } from './src/autoBackup';
import { installReminderHandlers } from './src/notify';
import { rescheduleNotes } from './src/portfolio/notes';
import { schedulePlan } from './src/portfolio/monthlyPlan';

SplashScreen.preventAutoHideAsync().catch(() => {});
setStorage(diskStore);
// Newer balance sheets than the ones bundled with this build, when online.
loadLiveFundamentals();
// the weekly backup, once the app has settled (it reads everything it saves)
setTimeout(() => maybeBackup(), 15_000);
installReminderHandlers();
setTimeout(() => (rescheduleNotes(), schedulePlan()), 20_000);
AppState.addEventListener('change', (st) => st === 'active' && maybeBackup());

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

function navThemeFor(dark: boolean) {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      background: colors.ground,
      card: colors.nav,
      border: colors.navLine,
      primary: colors.gold,
      text: colors.text,
    },
  };
}

const TAB_ICONS: Record<keyof TabParams, IconName> = {
  Home: 'home',
  Market: 'market',
  Trade: 'trade',
  Portfolio: 'portfolio',
  Ideas: 'star',
  AI: 'ai',
};

const IdeasTab = () => <PicksScreen asTab />;

/** Screens other than Home load the first time they're opened (getComponent), so the app starts faster. */
function Tabs() {
  const insets = useSafeAreaInsets();
  const layout = layoutPref.use();
  const on = useFlags();
  const shown = TABS_FOR[layout].filter((t) => (t !== 'Ideas' || on('ideas')) && (t !== 'AI' || on('ai')));
  return (
    <Tab.Navigator
      screenLayout={({ children, route }) => <ScreenBoundary name={route.name}>{children}</ScreenBoundary>}
      tabBar={layout === 'menu' ? (props) => <MenuButton {...props} /> : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        // a tab you're not looking at doesn't redraw on every live price update
        freezeOnBlur: true,
        // every screen stays registered so tools, menu and search can reach it; the layout picks which get a tab button
        ...(shown.includes(route.name) ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } }),
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.nav,
          borderTopColor: colors.navLine,
          height: 68 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
        tabBarIcon: ({ color }) => <Icon name={TAB_ICONS[route.name]} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Market" getComponent={() => require('./src/screens/MarketScreen').default} />
      <Tab.Screen name="Portfolio" getComponent={() => require('./src/screens/PortfolioScreen').default} />
      <Tab.Screen name="Ideas" component={IdeasTab} />
      <Tab.Screen name="AI" getComponent={() => require('./src/screens/AIScreen').default} />
      <Tab.Screen name="Trade" getComponent={() => require('./src/screens/TradeScreen').default} options={{ title: 'Practice' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { loaded, name } = useUser();
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  return (
    <Stack.Navigator
      screenLayout={({ children, route }) => <ScreenBoundary name={route.name}>{children}</ScreenBoundary>}
      initialRouteName={name ? 'Tabs' : 'Welcome'}
      screenOptions={{ headerShown: false, freezeOnBlur: true, contentStyle: { backgroundColor: colors.ground }, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Stock" getComponent={() => require('./src/screens/StockScreen').default} />
      <Stack.Screen name="Index" getComponent={() => require('./src/screens/IndexScreen').default} />
      <Stack.Screen name="Order" getComponent={() => require('./src/screens/OrderScreen').default} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings" getComponent={() => require('./src/screens/SettingsScreen').default} />
      <Stack.Screen name="Picks" component={PicksScreen} />
      <Stack.Screen name="EditHoldings" getComponent={() => require('./src/screens/EditHoldingsScreen').default} />
      <Stack.Screen name="Record" getComponent={() => require('./src/screens/RecordScreen').default} />
      <Stack.Screen name="Dividends" getComponent={() => require('./src/screens/DividendsScreen').default} />
      <Stack.Screen name="Summary" getComponent={() => require('./src/screens/SummaryScreen').default} />
      <Stack.Screen name="Alerts" getComponent={() => require('./src/screens/AlertsScreen').default} />
      <Stack.Screen name="News" getComponent={() => require('./src/screens/NewsScreen').default} />
      <Stack.Screen name="TaxStatement" getComponent={() => require('./src/screens/TaxStatementScreen').default} />
      <Stack.Screen name="WhatIf" getComponent={() => require('./src/screens/WhatIfScreen').default} />
      <Stack.Screen name="Rebalance" getComponent={() => require('./src/screens/RebalanceScreen').default} />
      <Stack.Screen name="Income" getComponent={() => require('./src/screens/IncomeScreen').default} />
      <Stack.Screen name="Compare" getComponent={() => require('./src/screens/CompareScreen').default} />
      <Stack.Screen name="Find" getComponent={() => require('./src/screens/FindScreen').default} />
    </Stack.Navigator>
  );
}

/** Links from notifications: sahm://portfolio, sahm://stock/LUCK, sahm://picks */
const linking: LinkingOptions<RootParams> = {
  prefixes: ['sahm://'],
  config: {
    screens: {
      Tabs: { screens: { Portfolio: 'portfolio', Market: 'market', Home: 'home' } },
      Stock: 'stock/:symbol',
      Picks: 'picks',
      Dividends: 'dividends',
      Summary: 'summary',
      Alerts: 'alerts',
      News: 'news',
      Find: 'find',
      Compare: 'compare',
      Income: 'income',
      Rebalance: 'rebalance',
      WhatIf: 'whatif',
      TaxStatement: 'tax',
    },
  },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <MarketProvider>
      <UserProvider>
        <UpdateProvider>
          <AiProvider>
            <ThemeProvider>
              <Themed />
            </ThemeProvider>
          </AiProvider>
        </UpdateProvider>
      </UserProvider>
    </MarketProvider>
  );
}

function Themed() {
  const { name } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navThemeFor(name === 'dark')} linking={linking}>
          <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
          <Root />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
