/**
 * Results season: when a company announces its financial results, and what
 * the new numbers say against the same period a year earlier.
 *
 * PSX lists results under the company's "Financial Results" announcements
 * the day they are released, and updates the quarterly and annual tables on
 * the company page soon after. A "Board Meeting" notice newer than the last
 * results usually means results are coming within days.
 */
import type { Announcement, CompanyInfo, FinTable } from '../psx/types';
import { fiscalEndMonth } from './fairValue';

const DAY = 864e5;
/** results this recent count as new */
export const FRESH_DAYS = 7;

export interface ResultsNews {
  /** the results announcement */
  date: string;
  title: string;
  url: string | null;
  annual: boolean;
  /** announced within FRESH_DAYS */
  fresh: boolean;
  /** latest period in PSX's table against the same period a year earlier */
  period: string | null;
  vsPeriod: string | null;
  eps: number | null;
  epsBefore: number | null;
  epsChange: number | null;
  salesChange: number | null;
  profitChange: number | null;
  /** the figures PSX shows look older than the announcement (table not updated yet) */
  tableBehind: boolean;
}

export interface ResultsStatus {
  latest: ResultsNews | null;
  /** a board-meeting notice after the latest results: results are probably due */
  meetingNotice: Announcement | null;
}

const dayMs = (d: string) => Date.parse(d + 'T12:00:00Z');

/** A results announcement (not the later "transmission of report"). */
export function isResults(a: Announcement): boolean {
  return a.category === 'Financial Results' && /financial results?/i.test(a.title) && !/transmission/i.test(a.title);
}

const row = (t: FinTable | null | undefined, re: RegExp) => t?.rows.find((r) => re.test(r.label))?.values ?? [];
const change = (now: number | null | undefined, then: number | null | undefined) => (now != null && then != null && then > 0 ? now / then - 1 : null);

/** Month and year of the period end in a results title, e.g. "Quarter Ended - September 30, 2026" → 2026-09. */
export function periodEndOf(title: string): string | null {
  const m = title.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(\d{4})/i);
  if (!m) return null;
  const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase());
  return `${m[2]}-${String(mi + 1).padStart(2, '0')}`;
}

/**
 * The label PSX gives the period in its tables, from the period end and the
 * fiscal year end (0-based month): quarters are fiscal, e.g. September 2026
 * for a June year end is "Q1 2027"; a year is "2026".
 */
export function expectedLabel(end: string, fyEndMonth: number, annual: boolean): string {
  const y = Number(end.slice(0, 4));
  const m = Number(end.slice(5, 7)) - 1;
  const fy = m <= fyEndMonth ? y : y + 1;
  if (annual) return String(fy);
  const q = Math.floor(((m - fyEndMonth - 1 + 24) % 12) / 3) + 1;
  return `Q${q} ${fy}`;
}

/** The same-period-last-year column for a label like "Q1 2027" or "2026". */
function yearAgo(t: FinTable, label: string): number {
  const q = label.match(/(Q\d)\s*(\d{4})/i);
  if (q) return t.periods.findIndex((p) => p.toUpperCase() === `${q[1].toUpperCase()} ${Number(q[2]) - 1}`);
  const y = label.match(/^(\d{4})$/);
  if (y) return t.periods.findIndex((p) => p === String(Number(y[1]) - 1));
  // An unfamiliar label: don't guess, or last quarter would be shown as "a year earlier".
  return -1;
}

export function resultsStatus(c: CompanyInfo | null, now = Date.now()): ResultsStatus {
  const list = c?.announcements ?? [];
  const res = list.filter(isResults).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const meeting =
    list
      .filter((a) => a.category === 'Board Meetings' && /board meeting/i.test(a.title) && !/annual general|extra.?ordinary|agm|eogm|resolution/i.test(a.title))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const meetingNotice = meeting && (!res || meeting.date > res.date) && now - dayMs(meeting.date) < 21 * DAY ? meeting : null;
  if (!res || !c) return { latest: null, meetingNotice };

  const annual = /year ended|annual/i.test(res.title) && !/quarter|half|nine|six|three|month/i.test(res.title);
  const t = annual ? c.financialsAnnual : c.financialsQuarterly;
  let period: string | null = null, vsPeriod: string | null = null;
  let eps: number | null = null, epsBefore: number | null = null;
  let epsChange: number | null = null, salesChange: number | null = null, profitChange: number | null = null;
  if (t && t.periods.length) {
    period = t.periods[0];
    const j = yearAgo(t, period);
    if (j > 0) {
      vsPeriod = t.periods[j];
      const e = row(t, /^eps$/i), s = row(t, /^sales|revenue|income/i), p = row(t, /profit after/i);
      eps = e[0] ?? null;
      epsBefore = e[j] ?? null;
      epsChange = change(eps, epsBefore);
      salesChange = change(s[0], s[j]);
      profitChange = change(p[0], p[j]);
    }
  }
  // PSX updates its tables a little after the announcement; until then the numbers are the previous period's.
  const end = periodEndOf(res.title);
  const want = end ? expectedLabel(end, fiscalEndMonth(c.fiscalYearEnd), annual) : null;
  const tableBehind = !!(want && period && want.toUpperCase() !== period.toUpperCase() && !(annual && !t));
  return {
    latest: {
      date: res.date,
      title: res.title,
      url: res.url,
      annual,
      fresh: now - dayMs(res.date) <= FRESH_DAYS * DAY,
      period,
      vsPeriod,
      eps,
      epsBefore,
      epsChange,
      salesChange,
      profitChange,
      tableBehind,
    },
    meetingNotice,
  };
}

const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

/** One plain line, e.g. "Results out 16 Oct: EPS Rs 12.40 vs Rs 10.10 (+23%), sales +8%". */
export function resultsLine(r: ResultsNews): string {
  const when = new Date(dayMs(r.date)).toUTCString().slice(5, 11).replace(/^0/, '');
  const head = `${r.annual ? 'Annual results' : 'Results'} out ${when}`;
  if (r.tableBehind || r.eps == null) return `${head}; PSX hasn't updated its figures yet, read the announcement.`;
  const parts: string[] = [];
  parts.push(
    r.epsBefore != null
      ? `EPS Rs ${r.eps.toFixed(2)} vs Rs ${r.epsBefore.toFixed(2)} a year earlier${r.epsChange != null ? ` (${pc(r.epsChange)})` : r.epsBefore <= 0 && r.eps > 0 ? ' (back to profit)' : ''}`
      : `EPS Rs ${r.eps.toFixed(2)}`,
  );
  if (r.salesChange != null) parts.push(`sales ${pc(r.salesChange)}`);
  return `${head} (${r.period}): ${parts.join(', ')}`;
}

/** Holdings to watch this season: due soon (board meeting notice) or just reported. */
export function resultsBuzz(c: CompanyInfo | null, now = Date.now()): string | null {
  const s = resultsStatus(c, now);
  if (s.latest?.fresh) return resultsLine(s.latest);
  if (s.meetingNotice) return `Board meeting notice ${new Date(dayMs(s.meetingNotice.date)).toUTCString().slice(5, 11).replace(/^0/, '')}: results are probably due within days.`;
  return null;
}
