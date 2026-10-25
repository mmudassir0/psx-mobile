/** Settings for your real portfolio, saved on the phone. */
import { makePref } from '../prefs';
import type { TaxStatus } from '../analysis/dividends';

export const taxStatusPref = makePref<TaxStatus>('user.taxStatus', 'filer');
/** bonus issues already added to holdings, as "SYMBOL:announced" */
export const appliedBonusesPref = makePref<string[]>('real.appliedBonuses', []);
/** when each holding was bought, for capital gains tax (symbol → period); unset = from July 2024 */
export const boughtPref = makePref<Record<string, 'recent' | '2022-24' | '2013-22' | 'pre2013'>>('real.bought', {});
