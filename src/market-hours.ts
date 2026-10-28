/**
 * Rough PSX session window, used only to decide when to poll for prices.
 * Regular market: Mon–Thu ~09:30–15:30, Fri ~09:15–16:30 PKT (with a
 * Friday prayer break). We poll a little either side, and holidays simply
 * show unchanged prices.
 */
export function pkNow(now = Date.now()): { day: number; minutes: number } {
  const d = new Date(now + 5 * 3600_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function isMarketOpen(now = Date.now()): boolean {
  const { day, minutes } = pkNow(now);
  if (day === 0 || day === 6) return false;
  const open = 9 * 60 + 15;
  const close = day === 5 ? 16 * 60 + 45 : 15 * 60 + 45;
  // Friday prayer break: trading stops at 12:00 and resumes at 14:30.
  if (day === 5 && minutes > 12 * 60 + 15 && minutes < 14 * 60 + 15) return false;
  return minutes >= open && minutes <= close;
}

/** When the latest finished session ended (its close, plus a little for PSX to publish), at or before `now`. */
export function lastSessionEnd(now = Date.now()): number {
  const settle = 20; // minutes after the close for final prices
  for (let back = 0; back < 8; back++) {
    const t = now - back * 864e5;
    const d = new Date(t + 5 * 3600_000);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const closeMin = (day === 5 ? 16 * 60 + 45 : 15 * 60 + 45) + settle;
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 5 * 3600_000 + closeMin * 60_000;
    if (end <= now) return end;
  }
  return now - 7 * 864e5;
}

/** Prices fetched after the last session ended, while the market is shut: nothing newer will come until it opens. */
export const haveFinalPrices = (updatedAt: number | null, now = Date.now()) => !isMarketOpen(now) && updatedAt != null && updatedAt >= lastSessionEnd(now);
