/** Which cards Home shows (in the Tabs layout) and in what order; set in Settings → Home. */
import { makePref } from '../prefs';

export type HomeCardKey = 'indices' | 'mood' | 'tip' | 'lab' | 'brief' | 'news' | 'events' | 'alerts' | 'watchlist' | 'movers' | 'tools';

export const HOME_CARDS: { key: HomeCardKey; label: string }[] = [
  { key: 'indices', label: 'Indices' },
  { key: 'mood', label: 'Market mood' },
  { key: 'tip', label: 'Tip of the day' },
  { key: 'lab', label: 'Lab strategy you follow' },
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

/** A calmer start: what you own and watch first, reading further down, the daily tip off (it's in Learn). */
export const DEFAULT_LAYOUT: HomeLayout = {
  order: ['indices', 'watchlist', 'movers', 'events', 'lab', 'alerts', 'news', 'brief', 'mood', 'tip', 'tools'],
  hidden: ['tip'],
};
/** the layout before 0.64, which everyone who never changed it still has saved */
const OLD_DEFAULT = HOME_CARDS.map((c) => c.key).join();

export const homeCardsPref = makePref<HomeLayout>('ui.homeCards', DEFAULT_LAYOUT);

/** an untouched old default counts as the new default */
const current = (l: HomeLayout): HomeLayout => (l.order.join() === OLD_DEFAULT && !l.hidden.length ? DEFAULT_LAYOUT : l);

/** The saved order with any card added in a later version put back in its default place, hidden ones left out. */
export function visibleCards(l0: HomeLayout): HomeCardKey[] {
  const l = current(l0);
  return orderOf(l).filter((k) => !l.hidden.includes(k));
}

export function orderOf(l0: HomeLayout): HomeCardKey[] {
  const l = current(l0);
  const known = DEFAULT_LAYOUT.order;
  const order = l.order.filter((k) => known.includes(k));
  for (const k of known) if (!order.includes(k)) order.splice(Math.min(known.indexOf(k), order.length), 0, k);
  return order;
}

export function move(l0: HomeLayout, key: HomeCardKey, by: -1 | 1): HomeLayout {
  const l = current(l0);
  const order = orderOf(l);
  const i = order.indexOf(key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return l;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
}

export const isHidden = (l: HomeLayout, key: HomeCardKey) => current(l).hidden.includes(key);

export const toggle = (l0: HomeLayout, key: HomeCardKey): HomeLayout => {
  const l = current(l0);
  return { ...l, hidden: l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key] };
};
