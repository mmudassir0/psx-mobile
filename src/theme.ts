import type { TextStyle } from 'react-native';

/**
 * Sahm design tokens.
 * Deep slate ground, a brass accent used only for actions and selection,
 * green and red reserved for price moves, teal only for Shariah status.
 */
export const colors = {
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
  up: '#22C38E',
  upSoft: 'rgba(34,195,142,0.14)',
  down: '#F25C6A',
  downText: '#FF8590',
  downSoft: 'rgba(242,92,106,0.14)',
  shariah: '#3DC6C0',
  shariahSoft: 'rgba(61,198,192,0.13)',
} as const;

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
