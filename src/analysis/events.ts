/**
 * Days when bigger price moves are more likely. Not a direction.
 *
 * State Bank of Pakistan rate decisions (Monetary Policy Committee), from the
 * SBP's FY27 advance calendar (sbp.org.pk/m_policy/mp-calendar.asp, issued
 * June 2026). On 41 decisions from Nov 2021 to Sep 2026 the KSE-100 moved
 * 1.07% on the decision day on average, against 0.86% on a typical day, and
 * 12% of decision days moved more than 2% (7% of all days).
 */
export const MPC_DATES = ['2026-07-27', '2026-09-14', '2026-10-26', '2026-12-14', '2027-01-25', '2027-03-08', '2027-04-26', '2027-06-17'];
export const MPC_STATS = { decisions: 41, avgMove: 0.0107, typicalMove: 0.0086, bigShare: 0.12, bigShareAll: 0.07 };

export type EventKind = 'rates' | 'results' | 'exdate' | 'bookclosure';
export interface MarketEvent {
  /** YYYY-MM-DD, Pakistan */
  day: string;
  kind: EventKind;
  symbol?: string;
  title: string;
  detail: string;
}

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** Rate decisions from today to `days` ahead. */
export function rateEvents(now = Date.now(), days = 21): MarketEvent[] {
  const from = pkDay(now);
  const to = pkDay(now + days * 864e5);
  return MPC_DATES.filter((d) => d >= from && d <= to).map((day) => ({
    day,
    kind: 'rates',
    title: 'State Bank interest rate decision',
    detail: `Decision days have moved the KSE-100 about ${Math.round((MPC_STATS.avgMove / MPC_STATS.typicalMove - 1) * 100)}% more than usual, and more than 2% in a day ${Math.round(MPC_STATS.bigShare * 100)}% of the time (${Math.round(MPC_STATS.bigShareAll * 100)}% normally). The decision usually comes late in the day, so the next session can move too.`,
  }));
}

/** The next rate decision on or after the given day, if within `days`. */
export function nextRateDecision(now = Date.now(), days = 3): string | null {
  return rateEvents(now, days)[0]?.day ?? null;
}
