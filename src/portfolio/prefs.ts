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
export const benchmarkPref = makePref<'KSE100' | 'KMI30'>('real.benchmark', 'KSE100');
export const BENCH_LABEL = { KSE100: 'KSE-100', KMI30: 'KMI-30' } as const;
