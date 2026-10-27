/** Settings for your real portfolio, saved on the phone. */
import { makePref } from '../prefs';
import type { TaxStatus } from '../analysis/dividends';
import type { WatchRule } from '../analysis/watch';

export const taxStatusPref = makePref<TaxStatus>('user.taxStatus', 'filer');
/** bonus issues already added to holdings, as "SYMBOL:announced" */
export const appliedBonusesPref = makePref<string[]>('real.appliedBonuses', []);
/** when each holding was bought, for capital gains tax (symbol → period); unset = from July 2024 */
export const boughtPref = makePref<Record<string, 'recent' | '2022-24' | '2013-22' | 'pre2013'>>('real.bought', {});
/** which index your returns are compared with */
/** price alert rules (WATCH_ALERTS), and the text last copied to GitHub, to spot unsynced changes */
export const watchRulesPref = makePref<WatchRule[]>('real.watchAlerts', []);
export const watchCopiedPref = makePref<string>('real.watchAlertsCopied', '');
/** the watchlist last copied for the WATCHLIST_SYMBOLS secret (news alerts) */
export const watchlistCopiedPref = makePref<string>('user.watchlistCopied', '');
export const benchmarkPref = makePref<'KSE100' | 'KMI30'>('real.benchmark', 'KSE100');
export const BENCH_LABEL = { KSE100: 'KSE-100', KMI30: 'KMI-30' } as const;
/** bonus shares Sahm added (by itself or when you tapped), newest last */
export const bonusLogPref = makePref<import('./bonusAuto').BonusEntry[]>('real.bonusLog', []);
/** your own lines on each stock's chart (symbol → lines) */
export const chartLinesPref = makePref<Record<string, import('../analysis/chartLines').UserLines>>('user.chartLines', {});
