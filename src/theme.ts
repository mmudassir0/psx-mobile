import type { TextStyle } from 'react-native';

/**
 * Sahm design tokens, in a dark and a light palette.
 * A brass accent used only for actions and selection, green and red reserved
 * for price moves, teal only for Shariah status.
 *
 * `colors` is one shared object whose values are swapped by `applyTheme`.
 * Code reads `colors.x` at render time; module-level stylesheets go through
 * `themed()` so they are rebuilt for the active palette.
 */
const dark = {
  // style A: near-black, warm off-white text, a soft brass
  ground: '#0D0E10',
  surface: '#16181B',
  surface2: '#1F2226',
  line: '#2A2D33',
  hairline: '#1F2226',
  nav: '#0D0E10',
  navLine: '#1F2226',
  text: '#F2F0EA',
  text2: '#C9C8C1',
  muted: '#A3A39C',
  faint: '#8C8D86',
  gold: '#D9B762',
  goldSoft: 'rgba(217,183,98,0.14)',
  onGold: '#17140C',
  up: '#4CC48A',
  upSoft: 'rgba(76,196,138,0.14)',
  down: '#E5604D',
  downText: '#F08A79',
  downSoft: 'rgba(229,96,77,0.15)',
  shariah: '#7FC8C0',
  shariahSoft: 'rgba(127,200,192,0.13)',
  /** chart area fill under a rising / falling line: [top, bottom] */
  upFill0: 'rgba(76,196,138,0.20)',
  downFill0: 'rgba(229,96,77,0.20)',
  fillEnd: 'rgba(0,0,0,0)',
  avatar0: '#2A2F3A',
  avatar1: '#26302A',
  avatar2: '#332D22',
  avatar3: '#2E2B3A',
  avatar4: '#352A2D',
  avatar5: '#223234',
};

export type Palette = { [K in keyof typeof dark]: string };

const light: Palette = {
  // style B: warm paper ground, white cards, ink text, deep brass
  ground: '#F5F4EF',
  surface: '#FFFFFF',
  surface2: '#EFEEE9',
  line: '#E3E0D6',
  hairline: '#EFECE4',
  nav: '#FFFFFF',
  navLine: '#E8E5DC',
  text: '#16171A',
  text2: '#3C3F45',
  muted: '#5D6067',
  faint: '#6A6D74',
  gold: '#8E6614',
  goldSoft: 'rgba(184,137,42,0.13)',
  onGold: '#FFFFFF',
  up: '#0E7C4A',
  upSoft: 'rgba(14,124,74,0.10)',
  down: '#C0362C',
  downText: '#B0302A',
  downSoft: 'rgba(192,54,44,0.09)',
  shariah: '#0D7F7A',
  shariahSoft: 'rgba(13,127,122,0.10)',
  upFill0: 'rgba(14,124,74,0.16)',
  downFill0: 'rgba(192,54,44,0.14)',
  fillEnd: 'rgba(255,255,255,0)',
  avatar0: '#DCE4F0',
  avatar1: '#DDEBE1',
  avatar2: '#F1E6CF',
  avatar3: '#E5E0F2',
  avatar4: '#F2DEE1',
  avatar5: '#D8EBEA',
};

export type ThemeName = 'dark' | 'light';
export type ThemePref = 'system' | ThemeName;
export const palettes: Record<ThemeName, Palette> = { dark, light };

export const colors: Palette = { ...light };
let current: ThemeName = 'light';
let version = 0;

export function applyTheme(name: ThemeName) {
  if (name === current && version > 0) return;
  Object.assign(colors, palettes[name]);
  current = name;
  version++;
}
export const themeName = (): ThemeName => current;

/**
 * Wrap a style object factory so its values follow the active theme.
 * Use exactly like the object it returns: `styles.root`.
 */
export function themed<T extends object>(make: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  const get = (): T => {
    if (builtFor !== version || !cache) {
      cache = make();
      builtFor = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (get() as Record<string | symbol, unknown>)[key],
    has: (_t, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, key) => Object.getOwnPropertyDescriptor(get(), key),
  });
}

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  // Figures: IBM Plex Mono, every digit the same width, so columns and moving prices don't jump.
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const space = { gutter: 20, section: 28 } as const;

export function changeColor(v: number | null | undefined): string {
  if (v == null || v === 0) return colors.muted;
  return v > 0 ? colors.up : colors.down;
}

export function changeSoft(v: number | null | undefined): string {
  if (v == null || v === 0) return colors.surface2;
  return v > 0 ? colors.upSoft : colors.downSoft;
}
