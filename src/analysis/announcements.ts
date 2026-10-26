/** Company announcements from PSX, for the inbox: sorted into kinds people care about, and which are new since you last looked. */
import type { Announcement } from '../psx/types';
import { makePref } from '../prefs';

export type AnnKind = 'results' | 'meeting' | 'payout' | 'material' | 'insider' | 'other';

export const KIND_LABEL: Record<AnnKind, string> = {
  results: 'Results',
  meeting: 'Board meeting',
  payout: 'Dividend & bonus',
  material: 'Material info',
  insider: 'Insider trade',
  other: 'Other',
};

export function kindOf(a: Pick<Announcement, 'title' | 'category'>): AnnKind {
  const t = a.title.toLowerCase();
  if (a.category === 'Financial Results' || /financial results?/.test(t)) return 'results';
  if (/disclosure of interest|5\.6\.1|substantial shareholder|director.*(buy|sell|purchase|sale)/.test(t)) return 'insider';
  if (/material information/.test(t)) return 'material';
  if (/dividend|bonus|right shares?|book closure|entitlement|payout/.test(t)) return 'payout';
  if (a.category === 'Board Meetings' || /board meeting/.test(t)) return 'meeting';
  return 'other';
}

export interface InboxItem extends Announcement {
  symbol: string;
  kind: AnnKind;
  /** newer than when you last opened the inbox */
  fresh: boolean;
}

/** When you last looked (epoch ms); anything dated after that day counts as new. */
export const annSeenPref = makePref<number>('user.announcementsSeen', 0);

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

/** All announcements of these companies in the last `days`, newest first, without duplicates. */
export function inbox(bySymbol: Record<string, Announcement[]>, seenAt: number, now = Date.now(), days = 60): InboxItem[] {
  const from = pkDay(now - days * 864e5);
  const seenDay = seenAt ? pkDay(seenAt) : '';
  const seen = new Set<string>();
  const out: InboxItem[] = [];
  for (const [symbol, list] of Object.entries(bySymbol))
    for (const a of list) {
      const k = `${symbol}|${a.date}|${a.title}`;
      if (a.date < from || seen.has(k)) continue;
      seen.add(k);
      out.push({ ...a, symbol, kind: kindOf(a), fresh: !!seenDay && a.date > seenDay });
    }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
}
