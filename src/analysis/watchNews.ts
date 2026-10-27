/** The lines of the watchlist news notification: recent announcements only, the important kinds first. */
import type { AnnKind } from './announcements';

const ORDER: Record<AnnKind, number> = { material: 0, payout: 1, results: 2, meeting: 3, insider: 4, other: 5 };
const LABEL: Record<AnnKind, string> = { material: 'Material information', payout: 'Payout', results: 'Results', meeting: 'Board meeting', insider: 'Insider trade', other: 'Notice' };

export function newsLines(found: { symbol: string; title: string; date: string; kind: AnnKind }[], today: string, maxAgeDays = 4, max = 8): { symbol: string; text: string }[] {
  const from = new Date(Date.parse(today + 'T12:00:00Z') - maxAgeDays * 864e5).toISOString().slice(0, 10);
  const fresh = found.filter((f) => f.date >= from && f.date <= today);
  fresh.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.date < b.date ? 1 : -1));
  const lines = fresh.slice(0, max).map((f) => {
    const t = f.title.replace(/\s+/g, ' ').trim();
    return { symbol: f.symbol, text: `${f.symbol} · ${LABEL[f.kind]}: ${t.length > 90 ? t.slice(0, 88) + '…' : t}` };
  });
  if (fresh.length > max) lines.push({ symbol: '', text: `+${fresh.length - max} more in Sahm` });
  return lines;
}
