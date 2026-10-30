/** How the app is laid out: the same screens, reached four different ways. Chosen in Settings → Layout. */
import { makePref } from '../prefs';

export type Layout = 'tabs' | 'briefing' | 'menu' | 'stories';
export const layoutPref = makePref<Layout>('ui.layout', 'tabs');

export const LAYOUTS: { key: Layout; label: string; desc: string }[] = [
  { key: 'tabs', label: 'Tabs', desc: 'Five tabs at the bottom: Home, Market, Portfolio, Ideas, AI. Closest to before.' },
  { key: 'briefing', label: 'Briefing + tools', desc: "Home is today's short list, with a grid of every tool below. Three tabs." },
  { key: 'menu', label: 'Side menu', desc: 'Clean screens; everything is in the round menu button.' },
  { key: 'stories', label: 'Swipe stories', desc: 'Home is a deck of cards to swipe through each morning, then the tools. Three tabs.' },
];

/** The bottom tabs each layout shows (the others stay reachable from tools, menu and search). */
export const TABS_FOR: Record<Layout, string[]> = {
  tabs: ['Home', 'Market', 'Portfolio', 'Ideas', 'AI'],
  briefing: ['Home', 'Portfolio', 'Market'],
  menu: [],
  stories: ['Home', 'Portfolio', 'Market'],
};
