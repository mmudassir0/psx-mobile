/**
 * The widgets' look: the app's two palettes (A dark, B light) and its fonts, so a widget on the
 * home screen matches the app. The app saves which palette it's showing; widgets read it when drawn.
 * Plain values only (no phone APIs), so the tests can load it.
 */
export type Hex = `#${string}`;
export type Rgba = `rgba(${number}, ${number}, ${number}, ${number})`;

export interface Look {
  bg: Hex;
  line: Hex;
  text: Hex;
  text2: Hex;
  muted: Hex;
  gold: Hex;
  up: Hex;
  down: Hex;
  upSoft: Rgba;
  downSoft: Rgba;
  goldSoft: Rgba;
  flatSoft: Rgba;
}

export const LOOKS: Record<'dark' | 'light', Look> = {
  dark: {
    bg: '#16181B',
    line: '#2A2D33',
    text: '#F2F0EA',
    text2: '#C9C8C1',
    muted: '#8C8D86',
    gold: '#D9B762',
    up: '#4CC48A',
    down: '#F08A79',
    upSoft: 'rgba(76, 196, 138, 0.16)',
    downSoft: 'rgba(229, 96, 77, 0.17)',
    goldSoft: 'rgba(217, 183, 98, 0.15)',
    flatSoft: 'rgba(140, 141, 134, 0.16)',
  },
  light: {
    bg: '#FFFFFF',
    line: '#E8E5DC',
    text: '#16171A',
    text2: '#3C3F45',
    muted: '#6A6D74',
    gold: '#8E6614',
    up: '#0E7C4A',
    down: '#B0302A',
    upSoft: 'rgba(14, 124, 74, 0.10)',
    downSoft: 'rgba(192, 54, 44, 0.09)',
    goldSoft: 'rgba(184, 137, 42, 0.13)',
    flatSoft: 'rgba(106, 109, 116, 0.10)',
  },
};

export const LOOK_KEY = 'widget.look';

/** font files copied into the app by the widget plugin (app.json → fonts) */
export const WF = { mono: 'IBMPlexMono_500Medium', semi: 'Manrope_600SemiBold', heavy: 'Manrope_800ExtraBold' } as const;

export const lookFor = (name: string | null | undefined): Look => (name === 'light' ? LOOKS.light : LOOKS.dark);

/** green / red / grey for a change */
export const toneOf = (L: Look, v: number | null | undefined) => (v == null || v === 0 ? L.muted : v > 0 ? L.up : L.down);
export const softOf = (L: Look, v: number | null | undefined) => (v == null || v === 0 ? L.flatSoft : v > 0 ? L.upSoft : L.downSoft);

export const pkTime = (t: number) => {
  const d = new Date(t + 5 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
/** "14:05" today, "29 Oct" before */
export const stamp = (t: number, now = Date.now()) => {
  if (!t) return '';
  const day = (x: number) => new Date(x + 5 * 3600_000).toISOString().slice(0, 10);
  if (day(t) === day(now)) return pkTime(t);
  const d = new Date(t + 5 * 3600_000);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};
