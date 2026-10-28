/**
 * Reads PSX's index recomposition notices (KMI All Share and KMI-30): the
 * companies coming in and going out, or the full list where one is attached,
 * and the date it takes effect. Then rebuilds who was in the index on each
 * date, walking back from today's list. Pure.
 */
import { firstDate } from './divText';

export interface IndexEvent {
  /** the day the change takes effect */
  date: string;
  in: string[];
  out: string[];
  /** the whole list after the change, when the notice includes it */
  full?: string[];
}

const SYM = /^[A-Z][A-Z0-9]{1,9}$/;
const NOT = new Set(['LTD', 'LIMITED', 'PSX', 'KMI', 'KSE', 'NOTICE', 'THE', 'AND', 'SR', 'NO', 'TOTAL', 'PAKISTAN']);
const symOf = (seg: string): string | null => {
  const toks = seg.trim().split(/\s+/);
  let k = 0;
  if (/^\d+\.?$/.test(toks[0] ?? '')) k = 1;
  const t = (toks[k] ?? '').replace(/[^A-Z0-9]/g, '');
  return SYM.test(t) && !NOT.has(t) && toks[k] === toks[k].toUpperCase() ? t : null;
};

/** One notice's text (pdftotext -layout) and its date (YYYY-MM-DD). */
export function parseIndexNotice(text: string, noticeDay: string): IndexEvent | null {
  const lines = text.split('\n');
  const effM = text.match(/(?:w\.?\s?e\.?\s?f\.?|with effect from|effective from|implemented from)\s*:?\s*(.{0,60})/i);
  let date = effM ? firstDate(effM[1].replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')) : null;
  if (!date || date < noticeDay || date > `${Number(noticeDay.slice(0, 4)) + 1}${noticeDay.slice(4)}`) date = noticeDay;
  const ins: string[] = [];
  const outs: string[] = [];
  let full: string[] | undefined;
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i];
    const inAt = head.search(/incoming/i);
    const outAt = head.search(/outgoing/i);
    if (inAt >= 0 && outAt > inAt) {
      // the two columns split halfway between where the headings sit; symbols sit at or left of each heading
      const split = Math.floor((inAt + outAt) / 2) + 6;
      const li: string[] = [];
      const ro: string[] = [];
      let rows = 0;
      for (let j = i + 1; j < lines.length && j < i + 400; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        if (/^\s*(\*|note|copy to|-sd-|the recomposed)/i.test(l) || /LIST OF COMPANIES/i.test(l)) break;
        const left = symOf(l.slice(0, split));
        // right column: the first word at or after the outgoing heading's column, less a little
        const rightSeg = l.slice(Math.max(split, outAt - 12));
        const right = symOf(rightSeg);
        if (/^\s*\d+\.?\s/.test(l)) rows++;
        if (left) li.push(left);
        if (right) ro.push(right);
      }
      // tables of company names (no symbols) are left to the full list, if there is one
      if (li.length >= rows * 0.6) ins.push(...li);
      if (ro.length >= rows * 0.4) outs.push(...ro);
    }
    if (/LIST OF COMPANIES INCLUDED/i.test(head) && !full) {
      const list: string[] = [];
      for (let j = i + 1; j < lines.length && j < i + 500; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        if (/LIST OF|^\s*\*|total/i.test(l) && list.length) break;
        const s = symOf(l);
        if (s) list.push(s);
      }
      if (list.length >= 20) full = list;
    }
  }
  if (!ins.length && !outs.length && !full) return null;
  return { date, in: [...new Set(ins)], out: [...new Set(outs)], ...(full ? { full: [...new Set(full)] } : {}) };
}

/** Who was in the index from each date on, newest last: [from, members]. `now` is today's list. */
export function membershipHistory(now: string[], events: IndexEvent[]): { from: string; members: string[] }[] {
  const ev = [...events].sort((a, b) => (a.date < b.date ? 1 : -1));
  const out: { from: string; members: string[] }[] = [];
  let after = new Set(now);
  for (const e of ev) {
    const set = e.full ? new Set(e.full) : after;
    out.push({ from: e.date, members: [...set].sort() });
    const before = new Set(set);
    for (const s of e.in) before.delete(s);
    for (const s of e.out) before.add(s);
    after = before;
  }
  out.push({ from: '0000-00-00', members: [...after].sort() });
  return out.reverse();
}

/** Each symbol's spans in the index, as [from, to) dates (to '' = still in). */
export function spansOf(history: { from: string; members: string[] }[]): Map<string, [string, string][]> {
  const out = new Map<string, [string, string][]>();
  history.forEach((h, k) => {
    const to = history[k + 1]?.from ?? '';
    for (const s of h.members) {
      const l = out.get(s) ?? [];
      const last = l[l.length - 1];
      if (last && last[1] === h.from) last[1] = to;
      else l.push([h.from, to]);
      out.set(s, l);
    }
  });
  return out;
}
