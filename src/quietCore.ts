/**
 * Quieter notifications: a do-not-disturb window (alerts wait until it ends) and
 * an evening summary (the day's alerts come together at one time). Times are
 * Pakistan time, HH:MM. Pure, so it's tested without the phone.
 */
export interface QuietSettings {
  quiet: boolean;
  from: string;
  to: string;
  digest: boolean;
  digestAt: string;
}
export const QUIET_DEFAULT: QuietSettings = { quiet: false, from: '22:00', to: '08:00', digest: false, digestAt: '16:00' };
export const QUIET_TIMES = ['20:00', '21:00', '22:00', '23:00'];
export const WAKE_TIMES = ['07:00', '08:00', '09:00', '09:30'];
export const DIGEST_TIMES = ['15:45', '16:00', '18:00', '20:00'];

export interface HeldAlert {
  /** when it was raised, and when it goes out */
  t: number;
  at: number;
  title: string;
  body: string;
  url?: string;
}

const PK = 5 * 3600_000;
const hhmmOf = (now: number) => new Date(now + PK).toISOString().slice(11, 16);

export const inWindow = (hhmm: string, from: string, to: string) => (from === to ? false : from < to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to);

/** The next moment the clock in Pakistan reads `hhmm`, after `now`. */
export function nextAt(now: number, hhmm: string): number {
  const day = new Date(now + PK).toISOString().slice(0, 10);
  let t = Date.parse(`${day}T${hhmm}:00+05:00`);
  if (t <= now) t += 864e5;
  return t;
}

/** When an alert raised at `now` should go out: null means straight away. */
export function holdUntil(now: number, s: QuietSettings): number | null {
  let at: number | null = s.digest ? nextAt(now, s.digestAt) : null;
  if (s.quiet) {
    // a summary that would land in the quiet hours waits for them to end too
    const probe = at ?? now;
    if (inWindow(hhmmOf(probe), s.from, s.to)) at = nextAt(probe, s.to);
  }
  return at;
}

/** Adds an alert to the waiting ones, dropping those already sent. */
export function hold(q: HeldAlert[], a: HeldAlert, now: number): HeldAlert[] {
  return [...q.filter((x) => x.at > now), a].slice(-30);
}

/** One notification for everything going out at `at`. */
export function heldText(q: HeldAlert[], at: number): { title: string; body: string; url: string } | null {
  const due = q.filter((x) => x.at === at);
  if (!due.length) return null;
  if (due.length === 1) return { title: due[0].title, body: due[0].body, url: due[0].url ?? 'sahm://home' };
  const lines = due.flatMap((x) => x.body.split('\n')).filter(Boolean);
  return { title: `${due.length} alerts while you were away`, body: [...new Set(lines)].slice(0, 12).join('\n'), url: 'sahm://alerts' };
}
