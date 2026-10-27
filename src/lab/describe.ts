/** A strategy in one or two plain sentences, and checks on strategies read from backups or the AI. */
import { METRICS, type Filter, type Metric, type Strategy } from './engine';
import { BASE } from './templates';

const UNIVERSE = { all: 'liquid PSX stocks', kse100: 'KSE-100 stocks', kmi30: 'KMI-30 stocks', shariah: 'Shariah-compliant stocks' } as const;
const EVERY = { 1: 'every month', 3: 'every three months', 6: 'every six months', 12: 'once a year' } as const;

export const filterText = (f: Filter) => {
  if (f.m === 'trend200' && f.v === 0) return f.op === '>' ? 'above their 200-day average' : 'under their 200-day average';
  if (f.m === 'off52h' && f.op === '>' && f.v < 0) return `within ${-f.v}% of their 52-week high`;
  if (f.m === 'off52h' && f.op === '<' && f.v < 0) return `more than ${-f.v}% under their 52-week high`;
  const m = METRICS[f.m];
  const v = m.unit === '%' ? `${f.v}%` : m.unit === 'Rs M' ? `Rs ${f.v} million` : m.unit === 'Rs' ? `Rs ${f.v}` : `${f.v}`;
  return `${m.label.toLowerCase()} ${f.op === '>' ? 'above' : 'under'} ${v}`;
};

const rankText = (m: Metric, desc: boolean): string => {
  switch (m) {
    case 'yield':
      return desc ? 'highest dividend yields' : 'lowest dividend yields';
    case 'pe':
      return desc ? 'highest P/Es' : 'lowest P/Es';
    case 'vol':
      return desc ? 'bumpiest prices' : 'calmest prices';
    case 'off52h':
      return desc ? 'closest to their 52-week high' : 'furthest under their 52-week high';
    case 'value':
      return desc ? 'most traded' : 'least traded';
    case 'price':
      return desc ? 'highest share prices' : 'lowest share prices';
    case 'trend200':
      return desc ? 'furthest above their 200-day average' : 'furthest under their 200-day average';
    default:
      return `${desc ? 'biggest' : 'smallest'} ${METRICS[m].label.toLowerCase()}s`;
  }
};

export function describe(s: Strategy): string {
  const parts = [`The ${s.hold} ${UNIVERSE[s.universe]} with the ${rankText(s.rank, s.desc)}`];
  if (s.filters.length) parts[0] += `, if ${s.filters.map(filterText).join(' and ')}`;
  parts[0] += `, checked ${EVERY[s.every]}.`;
  const sells: string[] = [];
  if (s.stop > 0) sells.push(`${Math.round(s.stop * 100)}% under its best price`);
  if (s.exit200) sells.push('under its 200-day average');
  if (sells.length) parts.push(`Sold early when ${sells.join(' or ')}.`);
  return parts.join(' ');
}

const METRIC_KEYS = Object.keys(METRICS) as Metric[];
const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);

/** A complete, safe strategy from something that may be partial or wrong (a backup, the AI). Null if it's not one. */
export function toStrategy(x: unknown, id?: string): Strategy | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  const filters = (Array.isArray(o.filters) ? o.filters : [])
    .filter((f): f is Filter => !!f && typeof f === 'object' && METRIC_KEYS.includes((f as Filter).m) && ((f as Filter).op === '>' || (f as Filter).op === '<') && Number.isFinite((f as Filter).v))
    .slice(0, 6)
    .map((f) => ({ m: f.m, op: f.op, v: f.v }));
  const every = [1, 3, 6, 12].includes(o.every as number) ? (o.every as 1 | 3 | 6 | 12) : BASE.every;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : (id ?? `s${Date.now().toString(36)}`),
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'My strategy',
    universe: pick(o.universe, ['all', 'kse100', 'kmi30', 'shariah'] as const, BASE.universe),
    minValue: num(o.minValue, 0, 500, BASE.minValue),
    filters,
    rank: pick(o.rank, METRIC_KEYS, BASE.rank),
    desc: typeof o.desc === 'boolean' ? o.desc : BASE.desc,
    hold: Math.round(num(o.hold, 1, 100, BASE.hold)),
    every,
    weight: pick(o.weight, ['equal', 'lowvol'] as const, 'equal'),
    perSector: Math.round(num(o.perSector, 0, 50, BASE.perSector)),
    stop: num(o.stop, 0, 0.9, 0),
    exit200: o.exit200 === true,
    from: Math.round(num(o.from, 2017, 2030, BASE.from)),
    lump: num(o.lump, 0, 1e10, BASE.lump),
    monthly: num(o.monthly, 0, 1e9, BASE.monthly),
    costs: o.costs !== false,
    tax: pick(o.tax, ['filer', 'nonfiler', 'none'] as const, 'filer'),
    bench: pick(o.bench, ['KSE100', 'KMI30'] as const, 'KSE100'),
  };
}
