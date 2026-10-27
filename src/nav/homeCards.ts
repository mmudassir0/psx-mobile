/** Which cards Home shows (in the Tabs layout) and in what order; set in Settings → Home. */
import { makePref } from '../prefs';

export type HomeCardKey = 'indices' | 'mood' | 'tip' | 'brief' | 'news' | 'events' | 'alerts' | 'watchlist' | 'movers' | 'tools';

export const HOME_CARDS: { key: HomeCardKey; label: string }[] = [
  { key: 'indices', label: 'Indices' },
  { key: 'mood', label: 'Market mood' },
  { key: 'tip', label: 'Tip of the day' },
  { key: 'brief', label: 'Weekly brief' },
  { key: 'news', label: 'News' },
  { key: 'events', label: 'Coming up' },
  { key: 'alerts', label: 'Price alerts' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'movers', label: 'Movers today' },
  { key: 'tools', label: 'All tools' },
];

export interface HomeLayout {
  order: HomeCardKey[];
  hidden: HomeCardKey[];
}

export const homeCardsPref = makePref<HomeLayout>('ui.homeCards', { order: HOME_CARDS.map((c) => c.key), hidden: [] });

/** The saved order with any card added in a later version put back in its default place, hidden ones left out. */
export function visibleCards(l: HomeLayout): HomeCardKey[] {
  return orderOf(l).filter((k) => !l.hidden.includes(k));
}

export function orderOf(l: HomeLayout): HomeCardKey[] {
  const known = HOME_CARDS.map((c) => c.key);
  const order = l.order.filter((k) => known.includes(k));
  for (const k of known) if (!order.includes(k)) order.splice(Math.min(known.indexOf(k), order.length), 0, k);
  return order;
}

export function move(l: HomeLayout, key: HomeCardKey, by: -1 | 1): HomeLayout {
  const order = orderOf(l);
  const i = order.indexOf(key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return l;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
}

export const toggle = (l: HomeLayout, key: HomeCardKey): HomeLayout => ({ ...l, hidden: l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key] });
