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
  /** what the notice says in words: companies in the index after, added, removed */
  stated?: { total: number | null; added: number | null; removed: number | null };
}

/** Whether the lists read from a notice agree with the counts it states (OCR-free text can still split columns wrongly). */
export function trustworthy(e: IndexEvent, size: number): { inOut: boolean; full: boolean } {
  const st = e.stated;
  const near = (a: number, b: number | null | undefined) => b == null || Math.abs(a - b) <= Math.max(4, b * 0.15);
  const inOut = (e.in.length > 0 || e.out.length > 0) && near(e.in.length, st?.added) && near(e.out.length, st?.removed) && e.in.length < size * 0.6;
  const full = !!e.full && (st?.total != null ? near(e.full.length, st.total) : Math.abs(e.full.length - size) <= Math.max(3, size * 0.25));
  return { inOut, full };
}

const SYM = /^[A-Z][A-Z0-9]{1,9}$/;
const NOT = new Set(['LTD', 'LIMITED', 'PSX', 'KMI', 'KSE', 'NOTICE', 'THE', 'AND', 'SR', 'NO', 'TOTAL', 'PAKISTAN']);
const symOf = (seg: string): string | null => {
  // table rules an OCR'd scan leaves around words ("| 4 [PSMC |") aren't part of them
  const toks = seg
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[|[\]_(){}]+|[|[\]_(){}.,;:]+$/g, ''))
    .filter(Boolean);
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
  const n = (re: RegExp) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const stated = {
    total: n(/(?:consist of|comprise of|comprising of|comprises of)\s+(\d+)\s+companies/i),
    added: n(/(\d+)\s+(?:new\s+)?companies\s+(?:have been|are|were|will be)\s+(?:added|included)/i),
    removed: n(/(\d+)\s+companies\s+(?:have been|are|were|will be)\s+(?:removed|excluded)/i),
  };
  return { date, in: [...new Set(ins)], out: [...new Set(outs)], ...(full ? { full: [...new Set(full)] } : {}), stated };
}

/**
 * Older notices attach the whole recomposed list under a heading the reader takes for "incoming".
 * When nothing went out and the "incoming" list is the size the notice says the index has, it is the whole list.
 */
export function asFull(e: IndexEvent): IndexEvent {
  const total = e.stated?.total;
  if (e.full || e.out.length || total == null || total < 40) return e;
  if (Math.abs(e.in.length - total) > Math.max(4, total * 0.06)) return e;
  if (e.stated?.added != null && Math.abs(e.in.length - e.stated.added) <= Math.max(4, e.stated.added * 0.15)) return e;
  return { ...e, in: [], full: e.in };
}

/** Who was in the index from each date on, newest last: [from, members]. `now` is today's list. */
export function membershipHistory(now: string[], events: IndexEvent[], known?: Set<string>): { from: string; members: string[] }[] {
  // words a column read can pick up ("FINAL", "ENDED") are dropped when the list of real symbols is known
  const keep = (l: string[]) => (known ? l.filter((s) => known.has(s)) : l);
  // counts are checked on the lists as read (companies delisted since are real, just not listed today); members are filtered after
  const ev = [...events].map(asFull).sort((a, b) => (a.date < b.date ? 1 : -1));
  const out: { from: string; members: string[] }[] = [];
  let after = new Set(now);
  for (const e0 of ev) {
    const ok = trustworthy(e0, after.size);
    if (!ok.inOut && !ok.full) continue;
    const e = { ...e0, in: ok.inOut ? keep(e0.in) : [], out: ok.inOut ? keep(e0.out) : [], ...(e0.full ? { full: keep(e0.full) } : {}) };
    const set = ok.full ? new Set(e.full) : after;
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

/**
 * Tesseract's TSV (words with their positions) back into lines with the words at their columns, like
 * pdftotext -layout gives for a text PDF, so a scanned two-column table splits the same way.
 */
export function tsvToLayout(tsv: string, cols = 180): string {
  const rows = tsv
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 12 && c[0] === '5' && c[11].trim());
  if (!rows.length) return '';
  const right = Math.max(...rows.map((c) => Number(c[6]) + Number(c[8])));
  const charW = right / cols;
  const lines = new Map<string, { left: number; text: string }[]>();
  for (const c of rows) {
    const key = `${c[1]}-${c[2]}-${c[3]}-${c[4]}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key)!.push({ left: Number(c[6]), text: c[11].trim() });
  }
  const tops = new Map<string, number>();
  for (const c of rows) {
    const key = `${c[1]}-${c[2]}-${c[3]}-${c[4]}`;
    tops.set(key, Math.min(tops.get(key) ?? Infinity, Number(c[7])));
  }
  return [...lines.entries()]
    .sort((a, b) => tops.get(a[0])! - tops.get(b[0])!)
    .map(([, words]) => {
      let out = '';
      for (const w of words.sort((a, b) => a.left - b.left)) {
        const col = Math.round(w.left / charW);
        out += (out.length < col ? ' '.repeat(col - out.length) : out ? ' ' : '') + w.text;
      }
      return out;
    })
    .join('\n');
}

const dist1 = (a: string, b: string): boolean => {
  // at most one letter changed, added or dropped
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** OCR slips in symbols ("PSMC" read as "PSNC"): a word one letter away from exactly one real symbol becomes that symbol. */
export function fixSymbols(list: string[], known: Set<string>): string[] {
  const all = [...known];
  return list.map((s) => {
    if (known.has(s) || s.length < 4) return s;
    const near = all.filter((k) => k.length >= 4 && dist1(s, k));
    return near.length === 1 ? near[0] : s;
  });
}
