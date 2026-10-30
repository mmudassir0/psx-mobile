/**
 * The monthly practice challenge: each calendar month, did your practice account beat the KSE-100?
 * Measured from where both stood when the month began (or when you joined) to now. No phone APIs.
 */
export interface ChallengeMonth {
  month: string;
  /** the practice account it belongs to (a reset starts the month again) */
  account: number;
  startValue: number;
  startIndex: number;
  lastValue: number;
  lastIndex: number;
}

export interface ChallengeResult {
  month: string;
  ret: number;
  indexRet: number;
}

export interface ChallengeState {
  current: ChallengeMonth | null;
  history: ChallengeResult[];
}

export const NO_CHALLENGE: ChallengeState = { current: null, history: [] };

export const monthOf = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 7);

export function resultOf(m: ChallengeMonth): ChallengeResult {
  return { month: m.month, ret: m.startValue > 0 ? m.lastValue / m.startValue - 1 : 0, indexRet: m.startIndex > 0 ? m.lastIndex / m.startIndex - 1 : 0 };
}

/** Bring the challenge up to date with the account's value and the index now. */
export function stepChallenge(st: ChallengeState, now: { month: string; account: number; value: number; index: number }): ChallengeState {
  if (!(now.value > 0 && now.index > 0)) return st;
  const fresh = (startValue: number, startIndex: number): ChallengeMonth => ({ month: now.month, account: now.account, startValue, startIndex, lastValue: now.value, lastIndex: now.index });
  const c = st.current;
  if (!c || c.account !== now.account) return { ...st, current: fresh(now.value, now.index) };
  if (c.month === now.month) return { ...st, current: { ...c, lastValue: now.value, lastIndex: now.index } };
  // a new month: the old one is scored where it last stood, and the new one starts from there
  const done = resultOf(c);
  const history = [...st.history.filter((h) => h.month !== done.month), done].slice(-24);
  return { history, current: fresh(c.lastValue, c.lastIndex) };
}

/** Months in a row, latest first, that beat the index. */
export function streak(history: ChallengeResult[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].ret > history[i].indexRet; i--) n++;
  return n;
}
