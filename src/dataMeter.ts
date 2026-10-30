/**
 * How much Sahm downloaded today and this month (the size of what arrived, before the network's
 * compression, so the real figure is usually smaller). Counted in memory and saved now and then
 * once the app plugs storage in, so this file also runs in the Node tests.
 */
export interface Usage {
  day: string;
  today: number;
  month: string;
  thisMonth: number;
}

const pkDay = (t = Date.now()) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
let usage: Usage = { day: pkDay(), today: 0, month: pkDay().slice(0, 7), thisMonth: 0 };
let store: { load: () => Promise<Usage | null>; save: (u: Usage) => Promise<void> } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(u: Usage) => void>();

function roll(now = Date.now()) {
  const d = pkDay(now);
  if (usage.day !== d) usage = { ...usage, day: d, today: 0 };
  if (usage.month !== d.slice(0, 7)) usage = { ...usage, month: d.slice(0, 7), thisMonth: 0 };
}

/** Called by the download helpers with the size of each answer. */
export function countDownload(chars: number) {
  if (!(chars > 0)) return;
  roll();
  usage = { ...usage, today: usage.today + chars, thisMonth: usage.thisMonth + chars };
  if (store && !timer)
    timer = setTimeout(() => {
      timer = null;
      store?.save(usage).catch(() => {});
      listeners.forEach((f) => f(usage));
    }, 20_000);
}

export async function plugMeter(s: NonNullable<typeof store>) {
  store = s;
  const saved = await s.load().catch(() => null);
  if (saved) {
    // add what was counted before storage was ready
    const before = usage;
    usage = saved;
    roll();
    usage = { ...usage, today: usage.today + (before.day === usage.day ? before.today : 0), thisMonth: usage.thisMonth + (before.month === usage.month ? before.thisMonth : 0) };
  }
}

export function currentUsage(): Usage {
  roll();
  return usage;
}

export function onUsage(f: (u: Usage) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
