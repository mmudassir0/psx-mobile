/** When the daily offline copy is due (no phone APIs, so the tests can use it). */
/** Due when the last copy is from before today's close (16:00 Pakistan time) and it's now after it, or over a day old. */
export function offlineDue(lastAt: number, now = Date.now()): boolean {
  if (!lastAt) return true;
  if (now - lastAt > 24 * 3600_000) return true;
  const pk = new Date(now + 5 * 3600_000);
  const close = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate(), 16) - 5 * 3600_000;
  return now >= close && lastAt < close;
}
