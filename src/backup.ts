/**
 * Backup and restore of what exists only on this phone: your holdings, watchlist,
 * practice account, Sahm's track record and settings. A backup is plain JSON
 * text that can be saved anywhere (a note, an email to yourself) and pasted back.
 * API keys are never included.
 */
import { load, save } from './storage';

export const BACKUP_KEYS = [
  'user.name',
  'user.watchlist',
  'user.taxStatus',
  'real.holdings',
  'real.appliedBonuses',
  'paper.account',
  'journal.v1',
  'sahm:theme',
  'plan.amount',
  'chart.extras',
  'real.snapshots',
  'real.bought',
  'real.goal',
  'real.benchmark',
  'real.trades',
  'real.watchAlerts',
  'real.watchAlertsCopied',
  'real.weeklyBrief',
  'ui.layout',
  'ui.flags',
  'real.targets',
  'real.costs',
  'real.notes',
  'real.monthlyPlan',
  'real.goals',
  'user.watchGroups',
  'real.priceTargets',
  'ui.homeCards',
] as const;
type Key = (typeof BACKUP_KEYS)[number];

export interface Backup {
  app: 'sahm';
  v: 1;
  exportedAt: string;
  data: Partial<Record<Key, unknown>>;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strArr = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === 'string');

/** Each key's expected shape; anything else is left out of a restore. */
const VALID: Record<Key, (x: unknown) => boolean> = {
  'user.name': (x) => x === null || typeof x === 'string',
  'user.watchlist': strArr,
  'user.taxStatus': (x) => x === 'filer' || x === 'non-filer',
  'real.holdings': (x) =>
    Array.isArray(x) && x.every((h) => isObj(h) && typeof h.symbol === 'string' && typeof h.shares === 'number' && h.shares > 0 && typeof h.avgCost === 'number' && h.avgCost > 0),
  'real.appliedBonuses': strArr,
  'paper.account': (x) => isObj(x) && typeof x.cash === 'number' && isObj(x.positions) && Array.isArray(x.orders),
  'journal.v1': (x) => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.symbol === 'string' && typeof e.day === 'string' && typeof e.price === 'number'),
  'sahm:theme': (x) => typeof x === 'string',
  'plan.amount': (x) => typeof x === 'string',
  'chart.extras': strArr,
  'ui.flags': (x) => isObj(x) && Object.values(x).every((v) => typeof v === 'boolean'),
  'ui.layout': (x) => x === 'tabs' || x === 'briefing' || x === 'menu' || x === 'stories',
  'real.weeklyBrief': (x) => x === null || (isObj(x) && typeof x.week === 'string' && typeof x.text === 'string'),
  'real.watchAlertsCopied': (x) => typeof x === 'string',
  'real.watchAlerts': (x) => Array.isArray(x) && x.every((r) => isObj(r) && typeof r.symbol === 'string' && (r.dir === '<' || r.dir === '>')),
  'real.trades': (x) => Array.isArray(x) && x.every((t) => isObj(t) && typeof t.symbol === 'string' && typeof t.day === 'string' && typeof t.shares === 'number'),
  'real.benchmark': (x) => x === 'KSE100' || x === 'KMI30',
  'real.goal': (x) => x === null || (isObj(x) && typeof x.target === 'number' && typeof x.by === 'string' && typeof x.rate === 'number'),
  'real.bought': (x) => isObj(x) && Object.values(x).every((v) => ['recent', '2022-24', '2013-22', 'pre2013'].includes(v as string)),
  'ui.homeCards': (x) => isObj(x) && strArr(x.order) && strArr(x.hidden),
  'real.priceTargets': (x) => isObj(x) && Object.values(x).every((t) => isObj(t) && (t.target === null || typeof t.target === 'number') && (t.rethink === null || typeof t.rethink === 'number')),
  'user.watchGroups': (x) => Array.isArray(x) && x.every((g) => isObj(g) && typeof g.name === 'string' && strArr(g.symbols)),
  'real.goals': (x) => x === null || (Array.isArray(x) && x.every((g) => isObj(g) && typeof g.name === 'string' && typeof g.target === 'number' && typeof g.by === 'string' && typeof g.share === 'number')),
  'real.monthlyPlan': (x) => isObj(x) && typeof x.on === 'boolean' && typeof x.amount === 'number' && typeof x.day === 'number',
  'real.notes': (x) => isObj(x) && Object.values(x).every((n) => isObj(n) && typeof n.why === 'string' && isObj(n.then)),
  'real.costs': (x) => isObj(x) && typeof x.brokerage === 'number' && typeof x.salesTax === 'number' && typeof x.minPerShare === 'number',
  'real.targets': (x) => isObj(x) && Object.values(x).every((v) => typeof v === 'number' && v >= 0),
  'real.snapshots': (x) => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.day === 'string' && typeof e.value === 'number' && isObj(e.pos)),
};

export function makeBackup(values: Partial<Record<Key, unknown>>, now = new Date()): string {
  const data: Backup['data'] = {};
  for (const k of BACKUP_KEYS) if (values[k] !== undefined && values[k] !== null) data[k] = values[k];
  return JSON.stringify({ app: 'sahm', v: 1, exportedAt: now.toISOString(), data } satisfies Backup);
}

export async function exportBackup(): Promise<string> {
  const values: Partial<Record<Key, unknown>> = {};
  for (const k of BACKUP_KEYS) values[k] = await load<unknown>(k, null);
  return makeBackup(values);
}

export interface Restore {
  data: Partial<Record<Key, unknown>>;
  exportedAt: string;
  counts: { holdings: number; watchlist: number; journal: number; practice: boolean };
  skipped: Key[];
}

/** Reads and checks a pasted backup without writing anything. */
export function readBackup(raw: string): { ok: true; restore: Restore } | { ok: false; error: string } {
  const m = raw.trim().match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "That isn't a Sahm backup (no JSON found)." };
  let j: unknown;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return { ok: false, error: "The backup text is incomplete or changed; copy all of it again." };
  }
  if (!isObj(j) || j.app !== 'sahm' || j.v !== 1 || !isObj(j.data)) return { ok: false, error: "That isn't a Sahm backup." };
  const data: Restore['data'] = {};
  const skipped: Key[] = [];
  for (const k of BACKUP_KEYS) {
    if (!(k in j.data)) continue;
    if (VALID[k](j.data[k])) data[k] = j.data[k];
    else skipped.push(k);
  }
  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  return {
    ok: true,
    restore: {
      data,
      exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : '',
      counts: { holdings: len(data['real.holdings']), watchlist: len(data['user.watchlist']), journal: len(data['journal.v1']), practice: !!data['paper.account'] },
      skipped,
    },
  };
}

/** Writes a checked backup to the phone. Some screens pick it up only after Sahm restarts. */
export async function applyRestore(r: Restore): Promise<void> {
  for (const [k, v] of Object.entries(r.data)) await save(k, v);
}
