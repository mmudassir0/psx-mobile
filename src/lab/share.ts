/** A strategy as a short code to send to someone, and back. Only the rules travel: no money amounts or holdings. */
import type { Strategy } from './engine';
import { toStrategy } from './describe';
import { BASE } from './templates';

const PREFIX = 'SAHM1-';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function b64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return out;
}
function unb64(s: string): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const v = [...s.slice(i, i + 4)].map((c) => B64.indexOf(c));
    if (v.some((x) => x < 0)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    out.push((n >> 16) & 255);
    if (v.length > 2) out.push((n >> 8) & 255);
    if (v.length > 3) out.push(n & 255);
  }
  return out;
}
const utf8 = (s: string) => [...unescape(encodeURIComponent(s))].map((c) => c.charCodeAt(0));
const fromUtf8 = (b: number[]) => decodeURIComponent(escape(String.fromCharCode(...b)));

export function strategyCode(s: Strategy): string {
  const keep = {
    name: s.name,
    universe: s.universe,
    minValue: s.minValue,
    filters: s.filters,
    rank: s.rank,
    desc: s.desc,
    hold: s.hold,
    every: s.every,
    weight: s.weight,
    perSector: s.perSector,
    stop: s.stop,
    exit200: s.exit200,
    from: s.from,
    bench: s.bench,
    ...(s.sectors ? { sectors: s.sectors } : {}),
    ...(s.topSectors ? { topSectors: s.topSectors } : {}),
    ...(s.pauseBelow ? { pauseBelow: s.pauseBelow } : {}),
    ...(s.cashEarns ? { cashEarns: true } : {}),
  };
  return PREFIX + b64(utf8(JSON.stringify(keep)));
}

/** The strategy in a code (found anywhere in a message), with your own money settings; null if there's none. */
export function readCode(text: string, id: string): Strategy | null {
  const m = text.match(/SAHM1-([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const bytes = unb64(m[1]);
  if (!bytes) return null;
  try {
    const j = JSON.parse(fromUtf8(bytes));
    return toStrategy({ ...BASE, ...j, id, only: undefined }, id);
  } catch {
    return null;
  }
}
