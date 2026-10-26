/**
 * Every place in the app, in one list: the tool grid, the side menu and search
 * all read it, so no screen can be left without a way in.
 */
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { Flag } from '../flags';

type Nav = NavigationProp<ParamListBase>;

export interface Feature {
  key: string;
  label: string;
  emoji: string;
  group: 'My money' | 'Market' | 'Ideas' | 'App';
  /** extra words search should match */
  words: string;
  go: (nav: Nav) => void;
  /** hidden when any of these features is switched off (all must be off when `any` is set) */
  flags?: Flag[];
  any?: boolean;
}

const tab = (screen: string, params?: object) => (nav: Nav) => nav.navigate('Tabs', { screen, params });

export const FEATURES: Feature[] = [
  { key: 'home', label: 'Home', emoji: '🏠', group: 'My money', words: 'today start', go: tab('Home') },
  { key: 'portfolio', label: 'My holdings', emoji: '💼', group: 'My money', words: 'portfolio shares holdings review trim', go: tab('Portfolio', { view: 'holdings' }) },
  { key: 'plan', label: 'Invest cash & goal', emoji: '🎯', group: 'My money', words: 'plan goal new money monthly target', go: tab('Portfolio', { view: 'invest' }) },
  { key: 'insights', label: 'Returns & risk', emoji: '📈', group: 'My money', words: 'health check return kmi kse sector stress tax zakat insights performance', flags: ['health'], go: tab('Portfolio', { view: 'risk' }) },
  { key: 'sharecard', label: 'Share card', emoji: '🖼️', group: 'My money', words: 'share picture image whatsapp brag return card', go: (nav) => nav.navigate('ShareCard') },
  { key: 'summary', label: 'Monthly summary', emoji: '📅', group: 'My money', words: 'month report progress', flags: ['summary'], go: (nav) => nav.navigate('Summary') },
  { key: 'rebalance', label: 'Rebalance', emoji: '⚖️', group: 'My money', words: 'rebalance target weights allocation trim top up', go: (nav) => nav.navigate('Rebalance') },
  { key: 'results', label: 'Results season', emoji: '📊', group: 'My money', words: 'results earnings eps quarter profit announcement board meeting due', go: (nav) => nav.navigate('Results') },
  { key: 'income', label: 'Dividend income', emoji: '💰', group: 'My money', words: 'dividend income cash payout yearly monthly passive', flags: ['dividends'], go: (nav) => nav.navigate('Income') },
  { key: 'tax', label: 'Tax & zakat', emoji: '🧾', group: 'My money', words: 'capital gains cgt zakat tax year', flags: ['tax', 'zakat'], any: true, go: tab('Portfolio', { view: 'risk' }) },
  { key: 'taxstatement', label: 'Tax statement', emoji: '📄', group: 'My money', words: 'tax return filing statement pdf capital gains dividends withheld fbr', flags: ['tax'], go: (nav) => nav.navigate('TaxStatement') },
  { key: 'edit', label: 'Edit holdings', emoji: '✏️', group: 'My money', words: 'add paste screenshot import trades history ktrade', go: (nav) => nav.navigate('EditHoldings') },
  { key: 'alerts', label: 'Price alerts', emoji: '🔔', group: 'My money', words: 'alert notify price watch', flags: ['alerts'], go: (nav) => nav.navigate('Alerts') },
  { key: 'practice', label: 'Practice account', emoji: '🧪', group: 'My money', words: 'paper practice demo', flags: ['practice'], go: tab('Portfolio', { tab: 'paper' }) },
  { key: 'trade', label: 'Practice trade', emoji: '🔁', group: 'My money', words: 'paper buy sell order', flags: ['practice'], go: tab('Trade') },
  { key: 'market', label: 'Market & stocks', emoji: '📊', group: 'Market', words: 'stocks screener gainers losers sectors indices mood', go: tab('Market') },
  { key: 'watch', label: 'Watchlist', emoji: '⭐', group: 'Market', words: 'watch star favourite', flags: ['watchlist'], go: tab('Market', { mode: 'watch' }) },
  { key: 'kse', label: 'KSE-100', emoji: '📉', group: 'Market', words: 'index chart kse100', go: (nav) => nav.navigate('Index', { code: 'KSE100' }) },
  { key: 'kmi', label: 'KMI-30', emoji: '☪️', group: 'Market', words: 'shariah index kmi30', go: (nav) => nav.navigate('Index', { code: 'KMI30' }) },
  { key: 'sectors', label: 'Sector strength', emoji: '🏁', group: 'Market', words: 'sectors leaders laggards rotation momentum strongest weakest', go: (nav) => nav.navigate('Sectors') },
  { key: 'heatmap', label: 'Market map', emoji: '🗺️', group: 'Market', words: 'heatmap heat map treemap sectors tiles overview', go: (nav) => nav.navigate('Heatmap') },
  { key: 'compare', label: 'Compare stocks', emoji: '🆚', group: 'Market', words: 'compare versus vs side by side peers', go: (nav) => nav.navigate('Compare') },
  { key: 'whatif', label: 'What if', emoji: '⏳', group: 'Market', words: 'what if simulator back then past invested monthly sip history return', go: (nav) => nav.navigate('WhatIf') },
  { key: 'dividends', label: 'Dividend calendar', emoji: '💸', group: 'Market', words: 'dividend payout book closure bonus calendar', flags: ['dividends'], go: (nav) => nav.navigate('Dividends') },
  { key: 'announcements', label: 'Announcements', emoji: '📢', group: 'Market', words: 'announcements psx notices material information insider board meeting disclosure', go: (nav) => nav.navigate('Announcements') },
  { key: 'news', label: 'News', emoji: '📰', group: 'Market', words: 'headlines press dawn recorder', flags: ['news'], go: (nav) => nav.navigate('News') },
  { key: 'ideas', label: 'Ideas & picks', emoji: '💡', group: 'Ideas', words: 'picks long-term list experiment setups', flags: ['ideas'], go: tab('Ideas') },
  { key: 'record', label: "Sahm's record", emoji: '🏅', group: 'Ideas', words: 'track record verdicts scorecard', flags: ['ideas'], go: (nav) => nav.navigate('Record') },
  { key: 'ai', label: 'Ask AI', emoji: '✨', group: 'Ideas', words: 'ai chat question gemini groq', flags: ['ai'], go: tab('AI') },
  { key: 'costs', label: 'Trading costs', emoji: '🧮', group: 'App', words: 'fees brokerage charges commission break even cdc', go: (nav) => nav.navigate('Settings') },
  { key: 'export', label: 'Export to Excel', emoji: '📗', group: 'App', words: 'excel xlsx spreadsheet export download sheet accountant', go: (nav) => nav.navigate('Export') },
  { key: 'settings', label: 'Settings', emoji: '⚙️', group: 'App', words: 'settings theme backup keys tax status layout', go: (nav) => nav.navigate('Settings') },
  { key: 'find', label: 'Search', emoji: '🔎', group: 'App', words: 'find search', go: (nav) => nav.navigate('Find') },
];

export const GROUPS: Feature['group'][] = ['My money', 'Market', 'Ideas', 'App'];

export function findFeatures(q: string, on: (f: Flag) => boolean = () => true): Feature[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return visibleFeatures(on).filter((f) => f.key !== 'find' && (f.label.toLowerCase().includes(s) || f.words.includes(s) || s.split(/\s+/).every((w) => (f.label + ' ' + f.words).toLowerCase().includes(w))));
}

/** The tools to show, given which features are on. */
export function visibleFeatures(on: (f: Flag) => boolean): Feature[] {
  return FEATURES.filter((f) => !f.flags || (f.any ? f.flags.some(on) : f.flags.every(on)));
}
