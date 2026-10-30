/** One line icon per tool (replacing the emoji, whose styles never matched): 24-unit strokes, the colour of the text around them. */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

/** each glyph: path data, or "c cx cy r" for a circle */
const G: Record<string, string[]> = {
  chev: ['M9 6l6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'c 12 12 3'],
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  briefcase: ['M4 8h16v11H4z', 'M9 8V5h6v3', 'M4 13h16'],
  target: ['c 12 12 8.5', 'c 12 12 4.5', 'c 12 12 0.8'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'c 4 6 0.8', 'c 4 12 0.8', 'c 4 18 0.8'],
  share: ['M4 12v7h16v-7', 'M12 3v12', 'M8 7l4-4 4 4'],
  calendar: ['M4 5h16v15H4z', 'M4 10h16', 'M9 3v4', 'M15 3v4'],
  calendarDot: ['M4 5h16v15H4z', 'M4 10h16', 'M9 3v4', 'M15 3v4', 'c 15.5 15 1.4'],
  scale: ['M12 3v18', 'M7 21h10', 'M5 7h14', 'M5 7l-2.5 6h5z', 'M19 7l-2.5 6h5z'],
  coins: ['c 9 10 5', 'M14 5.6A5 5 0 1 1 13 19.5'],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  compass: ['c 12 12 9', 'M15.5 8.5l-2 5-5 2 2-5z'],
  search: ['c 11 11 7', 'M20 20l-4-4'],
  flask: ['M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3', 'M7.5 15h9'],
  flag: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'],
  barsUp: ['M5 20v-4', 'M10 20v-8', 'M15 20V9', 'M20 20V5'],
  book: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  trendDown: ['M4 7l6 6 4-4 6 6', 'M20 11v4h-4'],
  users: ['c 9 8 3.2', 'M3 20a6 6 0 0 1 12 0', 'c 17 9 2.5', 'M16.5 14.2A5 5 0 0 1 21 19'],
  plusBox: ['M4 4h16v16H4z', 'M12 8v8', 'M8 12h8'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4', 'M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8 20h8'],
  clipboard: ['M9 3h6v3H9z', 'M7 4.5H5V21h14V4.5h-2', 'M9 12h6', 'M9 16h4'],
  shield: ['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'],
  pie: ['M21 12a9 9 0 1 1-9-9v9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  notebook: ['M6 3h12v18H6z', 'M9 3v18', 'M12 8h4', 'M12 12h4'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  doc: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6', 'M10 17h6'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 21a2 2 0 0 0 4 0'],
  wallet: ['M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4z', 'M4 7l11-3v3', 'M16 13.5h2'],
  swap: ['M7 4v16', 'M3 8l4-4 4 4', 'M17 20V4', 'M21 16l-4 4-4-4'],
  line: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  star: ['M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z'],
  bars: ['M3 3v18h18', 'M8 17v-4', 'M12 17V9', 'M16 17v-6'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14', 'M15 6v14'],
  columns: ['M8 4v16', 'M16 4v16', 'M4 9h8', 'M12 15h8'],
  question: ['c 12 12 9', 'M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3', 'M12 17h.01'],
  megaphone: ['M3 10v4h4l6 4V6l-6 4z', 'M17 9a4 4 0 0 1 0 6'],
  news: ['M4 5h13v14H6a2 2 0 0 1-2-2z', 'M17 8h3v9a2 2 0 0 1-2 2', 'M7 9h7', 'M7 13h7'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  cap: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c3 2 9 2 12 0v-5'],
  bookOpen: ['M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3z', 'M21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z'],
  calculator: ['M6 3h12v18H6z', 'M9 7h6', 'M9 12h.01', 'M12 12h.01', 'M15 12h.01', 'M9 16h.01', 'M12 16h.01', 'M15 16h.01'],
  download: ['M12 4v11', 'M8 11l4 4 4-4', 'M4 19h16'],
  cloudOff: ['M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.5A3.3 3.3 0 0 0 7 18z', 'M3 3l18 18'],
  bank: ['M3 9l9-5 9 5', 'M5 9v9', 'M10 9v9', 'M14 9v9', 'M19 9v9', 'M3 20h18'],
  warn: ['M12 3.5 2.5 20h19z', 'M12 10v4.5', 'M12 17.2h.01'],
  clock: ['c 12 12 9', 'M12 7v5l3 2'],
  mic: ['M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  camera: ['M4 7h4l1.5-2h5L16 7h4v12H4z', 'c 12 13 3.5'],
  pin: ['M9 3h6', 'M10 3v6l-3 4h10l-3-4V3', 'M12 13v8'],
  image: ['M4 5h16v14H4z', 'c 9 10 1.6', 'M4 17l5-5 4 4 3-3 4 4'],
  gift: ['M4 10h16v3H4z', 'M5 13h14v8H5z', 'M12 10v11', 'M12 10C9 10 7 8 8.5 6.5S12 7 12 10', 'M12 10c3 0 5-2 3.5-3.5S12 7 12 10'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  user: ['c 12 8 4', 'M4 21a8 8 0 0 1 16 0'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  checkCircle: ['c 12 12 9', 'M8 12.5l3 3 5-6'],
  calendarX: ['M4 5h16v15H4z', 'M4 10h16', 'M9 3v4', 'M15 3v4', 'M10 13l4 4', 'M14 13l-4 4'],
  dot: ['c 12 12 4.2'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  sprout: ['M12 21v-9', 'M12 12C12 7 8.5 5 4 5c0 4.5 3 7 8 7z', 'M12 14c0-4 3-6.5 8-6.5 0 4-3 6.5-8 6.5z'],
  pulse: ['M3 12h4l2.5-6 5 12 2.5-6h4'],
  gear: ['c 12 12 3', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
};

/** tool key → glyph; anything new falls back to its group's */
const BY_KEY: Record<string, string> = {
  home: 'home',
  starter: 'sprout',
  insights: 'pulse',
  results: 'doc',
  divpayments: 'checkCircle',
  economy: 'bank',
  portfolio: 'briefcase',
  plan: 'target',
  timeline: 'list',
  sharecard: 'share',
  summary: 'calendar',
  rebalance: 'scale',
  income: 'coins',
  tax: 'receipt',
  sincebought: 'compass',
  labdivs: 'calendarDot',
  labhunt: 'search',
  lab: 'flask',
  warnings: 'flag',
  divgrowth: 'barsUp',
  diary: 'book',
  averagedown: 'trendDown',
  portfolios: 'users',
  logtrade: 'plusBox',
  yearreview: 'trophy',
  sellplan: 'clipboard',
  sectorlimits: 'shield',
  growth: 'pie',
  journal: 'notebook',
  shariah: 'moon',
  taxstatement: 'doc',
  edit: 'pencil',
  alerts: 'bell',
  inbox: 'bell',
  practice: 'wallet',
  trade: 'swap',
  market: 'line',
  watch: 'star',
  kse: 'line',
  kmi: 'bars',
  sectors: 'grid',
  heatmap: 'map',
  compare: 'columns',
  whatif: 'question',
  dividends: 'calendar',
  announcements: 'megaphone',
  news: 'news',
  ideas: 'bulb',
  ai: 'sparkle',
  learn: 'cap',
  glossary: 'bookOpen',
  costs: 'calculator',
  export: 'download',
  offline: 'cloudOff',
  settings: 'gear',
  find: 'search',
};
/** market event kind → glyph (Coming up, Today, the timeline) */
export const EVENT_GLYPH: Record<string, string> = { rates: 'bank', results: 'bars', exdate: 'coins', bookclosure: 'book', rights: 'receipt', holiday: 'calendarX' };

const BY_GROUP: Record<string, string> = { 'My money': 'briefcase', Market: 'line', Ideas: 'bulb', App: 'gear' };

export function toolGlyph(key: string, group?: string): string {
  return BY_KEY[key] ?? (group ? BY_GROUP[group] : undefined) ?? 'grid';
}

export function ToolIcon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const c = color ?? colors.text2;
  const parts = G[name] ?? G.grid;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {parts.map((d, i) => {
        if (d.startsWith('c ')) {
          const [cx, cy, r] = d.slice(2).split(' ').map(Number);
          return <Circle key={i} cx={cx} cy={cy} r={r} stroke={c} strokeWidth={1.7} fill={r < 1.5 || name === 'dot' ? c : 'none'} />;
        }
        return <Path key={i} d={d} stroke={c} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
}

/** A line icon in front of a short label: the replacement for "📷 Fill from…" style text links. */
export function IconLabel({ name, children, color, size = 16, style, textStyle }: { name: string; children: React.ReactNode; color?: string; size?: number; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const c = color ?? colors.gold;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
      <ToolIcon name={name} size={size} color={c} />
      <Text style={[{ fontFamily: fonts.semibold, fontSize: 13.5, color: c, flexShrink: 1 }, textStyle]}>{children}</Text>
    </View>
  );
}
