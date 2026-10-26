/**
 * A short problem log kept on the phone: crashes, failed downloads and other
 * errors, newest last. Settings → Problem log shares it as plain text so a
 * problem can be looked at from what really happened. It holds no holdings,
 * amounts or keys: messages are trimmed and anything that looks like a key or
 * token is blanked out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOG_KEY = 'debug.log';
const MAX = 150;

export interface LogEntry {
  /** epoch ms */
  t: number;
  /** where it happened, e.g. "market refresh", "screen Stock" */
  where: string;
  msg: string;
  /** a few stack lines for crashes */
  stack?: string;
}

let entries: LogEntry[] | null = null;
let loading: Promise<LogEntry[]> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(e: LogEntry[]) => void>();

/** Blanks API keys and tokens (Groq, Gemini, GitHub, ntfy topics in URLs) and long digit runs. */
export function scrub(s: string): string {
  return s
    .replace(/\b(gsk_|AIza|ghp_|gho_|github_pat_|sk-)[A-Za-z0-9_\-]{8,}/g, '$1•••')
    .replace(/(ntfy\.sh\/)[A-Za-z0-9_\-]+/g, '$1•••')
    .replace(/([?&](key|token|access_token)=)[^&\s]+/gi, '$1•••')
    .replace(/\b\d{10,}\b/g, '•••');
}

async function all(): Promise<LogEntry[]> {
  if (entries) return entries;
  if (!loading)
    loading = AsyncStorage.getItem(LOG_KEY)
      .then((raw) => {
        const v = raw ? (JSON.parse(raw) as LogEntry[]) : [];
        entries = Array.isArray(v) ? v : [];
        return entries;
      })
      .catch(() => (entries = []));
  return loading;
}

function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (entries) AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries)).catch(() => {});
  }, 1500);
}

/** Adds one entry. Repeats of the same problem within a minute are counted, not stored again. */
export function logProblem(where: string, e: unknown) {
  const err = e as { message?: string; stack?: string } | null;
  const msg = scrub(String(err?.message ?? e ?? 'unknown')).slice(0, 300);
  const stack = err?.stack
    ? scrub(
        err.stack
          .split('\n')
          .slice(1, 7)
          .map((l) => l.trim())
          .join('\n'),
      ).slice(0, 600)
    : undefined;
  const add = (list: LogEntry[]) => {
    const now = Date.now();
    const last = list[list.length - 1];
    if (last && last.where === where && last.msg.replace(/ \(×\d+\)$/, '') === msg && now - last.t < 60_000) {
      const n = Number(last.msg.match(/ \(×(\d+)\)$/)?.[1] ?? 1) + 1;
      last.msg = `${msg} (×${n})`;
      last.t = now;
    } else list.push({ t: now, where: where.slice(0, 60), msg, stack });
    if (list.length > MAX) list.splice(0, list.length - MAX);
    persist();
    listeners.forEach((l) => l([...list]));
  };
  // synchronous once loaded, so a crash is in the list before the app closes
  if (entries) add(entries);
  else all().then(add);
}

export async function problems(): Promise<LogEntry[]> {
  return [...(await all())];
}

export async function clearProblems() {
  entries = [];
  await AsyncStorage.removeItem(LOG_KEY).catch(() => {});
  listeners.forEach((l) => l([]));
}

export function onProblems(l: (e: LogEntry[]) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const two = (n: number) => String(n).padStart(2, '0');
/** Pakistan time, e.g. "26 Oct 14:31:07". */
function stamp(t: number) {
  const d = new Date(t + 5 * 3600_000);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

/** The text that is shared: a header about the app and phone, then the entries, newest first. */
export function reportText(list: LogEntry[], header: string[]): string {
  const lines = [...header, `${list.length} problem${list.length === 1 ? '' : 's'} logged`, ''];
  for (const e of [...list].reverse()) {
    lines.push(`${stamp(e.t)} · ${e.where}: ${e.msg}`);
    if (e.stack) lines.push(...e.stack.split('\n').map((l) => `    ${l}`));
  }
  return lines.join('\n');
}

/**
 * Logs crashes the app didn't catch and promises nobody handled. Call once at
 * startup; the previous handler still runs, so a real crash still closes the app.
 */
export function installCrashLogging() {
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
    HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void };
  };
  all(); // load the saved list now, so a crash can be added to it straight away
  const eu = g.ErrorUtils;
  if (eu) {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      logProblem(fatal ? 'crash' : 'error', e);
      // give the log a moment to reach storage before the app closes
      if (fatal && entries) AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries)).catch(() => {});
      prev(e, fatal);
    });
  }
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, e) => logProblem('unhandled', e),
  });
}
