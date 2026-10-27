/** Ready-made strategies to start from: each a common idea, with plain-English notes. */
import type { Strategy } from './engine';

export const BASE: Omit<Strategy, 'id' | 'name'> = {
  universe: 'all',
  minValue: 2,
  filters: [],
  rank: 'mom12',
  desc: true,
  hold: 10,
  every: 3,
  weight: 'equal',
  perSector: 3,
  stop: 0,
  exit200: false,
  from: 2018,
  lump: 100000,
  monthly: 10000,
  costs: true,
  tax: 'filer',
  bench: 'KSE100',
};

export interface Template {
  key: string;
  about: string;
  strategy: Strategy;
}

const t = (key: string, name: string, about: string, s: Partial<Strategy>): Template => ({ key, about, strategy: { ...BASE, id: `tpl-${key}`, name, ...s } });

export const TEMPLATES: Template[] = [
  t('income', 'Dividend payers', 'The 12 highest dividend yields above 6%, at most 3 from a sector, checked every six months.', {
    filters: [{ m: 'yield', op: '>', v: 6 }],
    rank: 'yield',
    hold: 12,
    every: 6,
  }),
  t('momentum', 'Momentum leaders', 'The 10 stocks up most over the last year, if still above their 200-day average. Checked monthly.', {
    filters: [{ m: 'trend200', op: '>', v: 0 }],
    rank: 'mom12',
    hold: 10,
    every: 1,
    minValue: 5,
  }),
  t('trend', 'Trend follower', 'KSE-100 stocks rising over three months, sold as soon as one drops under its 200-day average.', {
    universe: 'kse100',
    filters: [{ m: 'trend200', op: '>', v: 0 }],
    rank: 'mom3',
    hold: 15,
    every: 1,
    exit200: true,
  }),
  t('calm', 'Steady stocks', 'The 15 calmest liquid stocks (smallest price swings), checked every three months.', {
    rank: 'vol',
    desc: false,
    hold: 15,
    every: 3,
    minValue: 5,
  }),
  t('fallen', 'Fallen blue chips', 'KSE-100 stocks furthest under their 52-week high, bought every six months for a rebound.', {
    universe: 'kse100',
    rank: 'off52h',
    desc: false,
    hold: 10,
    every: 6,
  }),
  t('shariah', 'Shariah momentum', 'Shariah-compliant stocks up most over six months and above their 200-day average, with a 20% stop.', {
    universe: 'shariah',
    filters: [{ m: 'trend200', op: '>', v: 0 }],
    rank: 'mom6',
    hold: 10,
    every: 1,
    stop: 0.2,
  }),
  t('cheap', 'Cheapest on earnings', 'The 10 lowest P/Es (above 2), once a year. Earnings history is short, so it starts in 2023.', {
    filters: [{ m: 'pe', op: '>', v: 2 }],
    rank: 'pe',
    desc: false,
    hold: 10,
    every: 12,
    from: 2023,
  }),
  t('rotation', 'Sector rotation', 'The 3 sectors whose stocks rose most over six months, then their 3 strongest stocks each. Checked every three months.', {
    rank: 'mom6',
    hold: 9,
    every: 3,
    topSectors: 3,
    perSector: 3,
    minValue: 3,
  }),
  t('kse100', 'All of the KSE-100', 'Every KSE-100 stock in equal amounts, evened out once a year: a fair yardstick.', {
    universe: 'kse100',
    rank: 'value',
    hold: 100,
    every: 12,
    perSector: 0,
    minValue: 0,
  }),
];

export const newId = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
