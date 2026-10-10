export const colors = {
  ground: '#0B0F14',
  surface: '#131A22',
  surface2: '#1B2430',
  line: '#2A3646',
  nav: '#0E141B',
  navLine: '#1E2733',
  text: '#E8EDF3',
  text2: '#C9D2DD',
  muted: '#A3AFBF',
  faint: '#8B98A9',
  gold: '#F5B83D',
  goldSoft: 'rgba(245,184,61,0.14)',
  up: '#3DDC97',
  upSoft: 'rgba(61,220,151,0.12)',
  down: '#FF5A5F',
  downText: '#FF8A8E',
  downSoft: 'rgba(255,90,95,0.12)',
  shariah: '#4FD1C5',
  shariahSoft: 'rgba(79,209,197,0.12)',
} as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

export const radius = { chip: 6, control: 12, card: 18 } as const;

export function changeColor(v: number | null | undefined): string {
  if (v == null || v === 0) return colors.muted;
  return v > 0 ? colors.up : colors.down;
}
