import React, { useEffect } from 'react';
import { View } from 'react-native';
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
import SettingsScreen from './src/screens/SettingsScreen';
import PicksScreen from './src/screens/PicksScreen';
import EditHoldingsScreen from './src/screens/EditHoldingsScreen';
import RecordScreen from './src/screens/RecordScreen';
import DividendsScreen from './src/screens/DividendsScreen';
import { Icon, IconName } from './src/ui/kit';
import WelcomeScreen from './src/screens/WelcomeScreen';
import HomeScreen from './src/screens/HomeScreen';
import MarketScreen from './src/screens/MarketScreen';
import TradeScreen from './src/screens/TradeScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import AIScreen from './src/screens/AIScreen';
import StockScreen from './src/screens/StockScreen';
import IndexScreen from './src/screens/IndexScreen';
import OrderScreen from './src/screens/OrderScreen';
import { loadLiveFundamentals } from './src/psx/fundamentals';

SplashScreen.preventAutoHideAsync().catch(() => {});
setStorage(diskStore);
// Newer balance sheets than the ones bundled with this build, when online.
loadLiveFundamentals();

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
  AI: 'ai',
};

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
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
      <Tab.Screen name="Market" component={MarketScreen} />
      <Tab.Screen name="Trade" component={TradeScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="AI" component={AIScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { loaded, name } = useUser();
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  return (
    <Stack.Navigator
      initialRouteName={name ? 'Tabs' : 'Welcome'}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground }, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Stock" component={StockScreen} />
      <Stack.Screen name="Index" component={IndexScreen} />
      <Stack.Screen name="Order" component={OrderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Picks" component={PicksScreen} />
      <Stack.Screen name="EditHoldings" component={EditHoldingsScreen} />
      <Stack.Screen name="Record" component={RecordScreen} />
      <Stack.Screen name="Dividends" component={DividendsScreen} />
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
