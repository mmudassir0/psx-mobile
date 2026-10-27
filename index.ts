import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/handler';

import { installCrashLogging } from './src/log';
import { defineIntradayTask } from './src/portfolio/intraday';

// as early as possible, so a crash while starting is logged too
installCrashLogging();
// background tasks must be defined before the app starts
defineIntradayTask();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// The home screen widget draws itself in the background; Android only.
if (Platform.OS === 'android') {
  try {
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // the app still works without the widget
  }
}
