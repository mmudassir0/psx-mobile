/** Settings for your real portfolio, saved on the phone. */
import { makePref } from '../prefs';
import type { TaxStatus } from '../analysis/dividends';

export const taxStatusPref = makePref<TaxStatus>('user.taxStatus', 'filer');
/** bonus issues already added to holdings, as "SYMBOL:announced" */
export const appliedBonusesPref = makePref<string[]>('real.appliedBonuses', []);
