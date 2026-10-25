/**
 * Features you can switch off in Settings. Off means hidden everywhere (cards,
 * tabs, tool grid, menu, search); your saved data is kept and comes back when
 * switched on again.
 */
import { makePref } from './prefs';

export type Flag = 'practice' | 'ideas' | 'ai' | 'brief' | 'news' | 'mood' | 'dividends' | 'comingUp' | 'alerts' | 'range' | 'summary' | 'health' | 'tax' | 'zakat' | 'rights' | 'watchlist';

export const FLAGS: { key: Flag; label: string; desc: string }[] = [
  { key: 'news', label: 'News', desc: 'Business headlines on Home, the News screen and each stock' },
  { key: 'comingUp', label: 'Coming up', desc: 'Rate decisions, ex-dates, results and holidays ahead' },
  { key: 'mood', label: 'Market mood', desc: 'The 0–100 fear and greed gauge' },
  { key: 'dividends', label: 'Dividend calendar', desc: 'Upcoming payouts across the PSX' },
  { key: 'alerts', label: 'Price alerts', desc: 'Alerts you set, and the alerts card on Home' },
  { key: 'range', label: 'Likely range', desc: 'The 80% price range on stock and index screens' },
  { key: 'summary', label: 'Monthly summary & goal', desc: 'Return by month, and your goal tracker' },
  { key: 'health', label: 'Health check & returns', desc: 'Portfolio health check, returns vs index, stress test' },
  { key: 'tax', label: 'Tax on selling', desc: 'Capital gains tax estimates and this tax year' },
  { key: 'zakat', label: 'Zakat', desc: 'Zakat on your shares' },
  { key: 'rights', label: 'Rights issues', desc: 'Rights offers on your holdings' },
  { key: 'ideas', label: 'Ideas & picks', desc: 'Daily picks, the long-term list and the Ideas tab' },
  { key: 'ai', label: 'AI', desc: 'The AI tab and AI answers on stocks' },
  { key: 'brief', label: 'Weekly AI brief', desc: 'The Friday note on your holdings' },
  { key: 'practice', label: 'Practice account', desc: 'Paper trading with practice money' },
  { key: 'watchlist', label: 'Watchlist & movers', desc: "Your watchlist and the day's movers" },
];

export const flagsPref = makePref<Partial<Record<Flag, boolean>>>('ui.flags', {});

/** True unless switched off. */
export const isOn = (flags: Partial<Record<Flag, boolean>>, k: Flag) => flags[k] !== false;

export function useFlag(k: Flag): boolean {
  return isOn(flagsPref.use(), k);
}

export function useFlags() {
  const f = flagsPref.use();
  return (k: Flag) => isOn(f, k);
}
