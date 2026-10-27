/**
 * Sahm's picks against your own portfolio over the same days: for each finished
 * pick, its return from the pick day to the day it closed, and your portfolio's
 * real return (from Sahm's daily record) over exactly those days.
 */
export interface PickWindow {
  symbol: string;
  day: string;
  closedDay: string | null;
  ret: number | null;
}

export function picksVsMine(picks: PickWindow[], track: { day: string; ret: number }[]): { n: number; picks: number; mine: number; better: number; from: string | null } | null {
  if (track.length < 2) return null;
  const at = (d: string) => {
    let g: number | null = null;
    for (const p of track) {
      if (p.day > d) break;
      g = 1 + p.ret;
    }
    return g;
  };
  const rows: { p: number; m: number; day: string }[] = [];
  for (const p of picks) {
    if (p.ret == null || !p.closedDay || p.day < track[0].day) continue;
    const a = at(p.day);
    const b = at(p.closedDay);
    if (a == null || b == null) continue;
    rows.push({ p: p.ret, m: b / a - 1, day: p.day });
  }
  if (!rows.length) return null;
  const avg = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  return { n: rows.length, picks: avg(rows.map((r) => r.p)), mine: avg(rows.map((r) => r.m)), better: rows.filter((r) => r.p > r.m).length, from: rows.map((r) => r.day).sort()[0] };
}
