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
  ground: '#0E141C',
  surface: '#161E29',
  surface2: '#1D2733',
  line: '#283444',
  hairline: '#1F2935',
  nav: '#111821',
  navLine: '#1F2935',
  text: '#EDF1F5',
  text2: '#C3CCD6',
  muted: '#97A3B2',
  faint: '#7B8797',
  gold: '#E8B04B',
  goldSoft: 'rgba(232,176,75,0.14)',
  onGold: '#0E141C',
  up: '#22C38E',
  upSoft: 'rgba(34,195,142,0.14)',
  down: '#F25C6A',
  downText: '#FF8590',
  downSoft: 'rgba(242,92,106,0.14)',
  shariah: '#3DC6C0',
  shariahSoft: 'rgba(61,198,192,0.13)',
  /** chart area fill under a rising / falling line: [top, bottom] */
  upFill0: 'rgba(34,195,142,0.26)',
  downFill0: 'rgba(242,92,106,0.26)',
  fillEnd: 'rgba(0,0,0,0)',
  avatar0: '#2A3A52',
  avatar1: '#2E3B33',
  avatar2: '#3B3326',
  avatar3: '#35304A',
  avatar4: '#3A2E33',
  avatar5: '#263B3D',
};

export type Palette = { [K in keyof typeof dark]: string };

const light: Palette = {
  ground: '#FFFFFF',
  surface: '#F4F6F9',
  surface2: '#E9EDF2',
  line: '#D5DCE4',
  hairline: '#E8ECF1',
  nav: '#FFFFFF',
  navLine: '#E1E6EC',
  text: '#0F1722',
  text2: '#334152',
  muted: '#566375',
  faint: '#6E7A89',
  gold: '#B9811C',
  goldSoft: 'rgba(185,129,28,0.12)',
  onGold: '#FFFFFF',
  up: '#0E9F6E',
  upSoft: 'rgba(14,159,110,0.12)',
  down: '#DC3545',
  downText: '#C82333',
  downSoft: 'rgba(220,53,69,0.10)',
  shariah: '#0D8F8A',
  shariahSoft: 'rgba(13,143,138,0.11)',
  upFill0: 'rgba(14,159,110,0.20)',
  downFill0: 'rgba(220,53,69,0.18)',
  fillEnd: 'rgba(255,255,255,0)',
  avatar0: '#DCE6F5',
  avatar1: '#DDEFE3',
  avatar2: '#F4E8D2',
  avatar3: '#E6E0F6',
  avatar4: '#F4DFE3',
  avatar5: '#D7EEEE',
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
  // Figures use Manrope with tabular digits so columns line up.
  mono: 'Manrope_500Medium',
  monoMedium: 'Manrope_600SemiBold',
  monoBold: 'Manrope_700Bold',
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
