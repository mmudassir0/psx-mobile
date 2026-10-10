/**
 * Tiny HTML table reader. React Native has no DOM, and the PSX pages we read
 * are plain server-rendered tables, so a careful regex walk is enough and
 * keeps the bundle small (no cheerio / node polyfills).
 */

export interface Cell {
  text: string;
  attrs: Record<string, string>;
  html: string;
}

export interface Row {
  cells: Cell[];
  attrs: Record<string, string>;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCharCode(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

/** All <tr> rows in the document (or fragment), with their <td>/<th> cells. */
export function readRows(html: string, cellTag: 'td' | 'th' | 'any' = 'td'): Row[] {
  const rows: Row[] = [];
  const trRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  const tag = cellTag === 'any' ? 't[dh]' : cellTag;
  const cellRe = new RegExp(`<(${tag})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'gi');
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: Cell[] = [];
    let c: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((c = cellRe.exec(tr[2]))) {
      cells.push({ text: stripTags(c[3]), attrs: parseAttrs(c[2]), html: c[3] });
    }
    rows.push({ cells, attrs: parseAttrs(tr[1]) });
  }
  return rows;
}

/** Strip commas, %, spaces; accounting negatives "(1.2)"; null when not numeric. */
export function num(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let t = String(raw).replace(/[,%\s ]/g, '').replace(/^Rs\.?/i, '').trim();
  if (!t || t === '-' || t === '—' || t === 'N/A') return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}
