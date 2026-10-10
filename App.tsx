import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
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
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { colors, fonts } from './src/theme';
import type { RootParams, TabParams } from './src/nav/types';
import { MarketProvider } from './src/store/market';
import { UserProvider, useUser } from './src/store/user';
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

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.ground,
    card: colors.nav,
    border: colors.navLine,
    primary: colors.gold,
    text: colors.text,
  },
};

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
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <MarketProvider>
        <UserProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <Root />
          </NavigationContainer>
        </UserProvider>
      </MarketProvider>
    </SafeAreaProvider>
  );
}
