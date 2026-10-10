/** Number formatting without relying on Intl (Hermes builds vary). */

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(decimals).split('.');
  return (neg ? '-' : '') + group(i) + (d ? '.' + d : '');
}

export function fmtPrice(v: number | null | undefined): string {
  return fmtNum(v, 2);
}

export function fmtPkr(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return 'PKR —';
  return 'PKR ' + fmtNum(v, decimals);
}

export function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + fmtNum(v, decimals);
}

export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return (signed && v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

export function arrowPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return '0.00%';
  return (v > 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(2) + '%';
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Dates shown in Pakistan time regardless of the phone's zone. */
export function pkDate(ms: number): Date {
  return new Date(ms + 5 * 3600_000);
}

export function fmtDay(ms: number): string {
  const d = pkDate(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtTime(ms: number): string {
  const d = pkDate(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function fmtDateTime(ms: number): string {
  return `${fmtDay(ms)}, ${fmtTime(ms)}`;
}
