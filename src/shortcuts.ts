/**
 * Long-press the Sahm icon: Record a trade, Watchlist, Market, Ask AI.
 * Each opens its screen through the app's own sahm:// links. Android only.
 */
import { Linking, Platform } from 'react-native';
import { logProblem } from './log';

export const SHORTCUTS = [
  { id: 'trade', title: 'Record a trade', icon: 'shortcut_trade', params: { url: 'sahm://log-trade' } },
  { id: 'watch', title: 'Watchlist', icon: 'shortcut_watch', params: { url: 'sahm://market?mode=watch' } },
  { id: 'market', title: 'Market', icon: 'shortcut_market', params: { url: 'sahm://market' } },
  { id: 'ai', title: 'Ask AI', icon: 'shortcut_ai', params: { url: 'sahm://ai' } },
];

export async function installShortcuts() {
  if (Platform.OS !== 'android') return;
  try {
    const QA = await import('expo-quick-actions');
    const open = (a: { params?: Record<string, unknown> | null } | undefined) => {
      const url = a?.params?.url;
      if (typeof url === 'string' && url.startsWith('sahm://')) setTimeout(() => Linking.openURL(url).catch(() => {}), 300);
    };
    await QA.setItems(SHORTCUTS);
    QA.addListener(open);
    // the app was started from a shortcut
    open(QA.initial as never);
  } catch (e) {
    logProblem('shortcuts', e);
  }
}
