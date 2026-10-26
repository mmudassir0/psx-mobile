/**
 * Your own note on a stock: why you bought it, and when to look again. The
 * figures at the time are kept, so later you can see whether the reason
 * still holds ("bought for a 12% yield: it's 7% now").
 */
import { makePref } from '../prefs';
import { cancelReminder, morningOf, remind } from '../notify';
import { dueNotes, inMonths, moved, pkDay } from './noteDates';

export { dueNotes, inMonths, moved };

export interface NoteFigures {
  price: number | null;
  pe: number | null;
  divYield: number | null;
  /** Sahm's fair value (middle of the range) */
  fair: number | null;
}

export interface StockNote {
  why: string;
  /** YYYY-MM-DD to look again, or null */
  checkOn: string | null;
  /** when written or last confirmed, epoch ms */
  at: number;
  then: NoteFigures;
}

export const notesPref = makePref<Record<string, StockNote>>('real.notes', {});

const reminderId = (symbol: string) => `note-${symbol}`;

function schedule(symbol: string, n: StockNote) {
  if (n.checkOn) remind(reminderId(symbol), morningOf(n.checkOn), `Time to check ${symbol}`, `Your note: "${n.why.slice(0, 90)}". Does the reason still hold?`, `sahm://stock/${symbol}`);
  else cancelReminder(reminderId(symbol));
}

export async function saveNote(symbol: string, n: StockNote) {
  const all = await notesPref.get();
  await notesPref.set({ ...all, [symbol]: n });
  schedule(symbol, n);
}

export async function deleteNote(symbol: string) {
  const { [symbol]: _gone, ...rest } = await notesPref.get();
  await notesPref.set(rest);
  cancelReminder(reminderId(symbol));
}

/** After a restore or a reinstall: puts back the reminders for review dates still ahead. */
export async function rescheduleNotes() {
  const all = await notesPref.get();
  const today = pkDay(Date.now());
  for (const [s, n] of Object.entries(all)) if (n.checkOn && n.checkOn > today) schedule(s, n);
}
