/**
 * Unusual trading: a day's volume against the stock's normal day (the median
 * of the 20 sessions before), and big moves. Heavy volume often comes before
 * the news is out.
 */
export const VOLUME_TIMES = 3;
export const MIN_VOLUME = 50_000;
export const BIG_MOVE = 0.05;

/** The median volume of the `n` sessions before the last one. */
export function normalVolume(volumes: number[], n = 20): number | null {
  const v = volumes.slice(-n - 1, -1).filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 10) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** How many times its normal volume `today` is, when it's unusual (≥ 3× and at least 50,000 shares), else null. */
export function volumeSpike(volumes: number[], today = volumes[volumes.length - 1]): number | null {
  const normal = normalVolume(volumes);
  if (!normal || !(today >= MIN_VOLUME)) return null;
  const x = today / normal;
  return x >= VOLUME_TIMES ? x : null;
}
