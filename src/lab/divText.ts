/**
 * Reads a cash dividend out of a PSX notice (financial results, or a dividend
 * notice), from its text or OCR: the amount per share (or the % of face value),
 * whether it says NIL, and the first day of book closure.
 */

export interface DivNotice {
  /** Rs per share */
  dps: number | null;
  /** % of face value, when only that is given */
  pct: number | null;
  nil: boolean;
  /** the % of face value given next to the amount ("Rs 7 per share i.e. 70%"), to work out face value */
  pctToo: number | null;
  /** first day the share transfer books are closed, YYYY-MM-DD */
  closeFrom: string | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => (y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const mon = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;

/** The first date in `s`: "September 16, 2024", "16th September, 2024", "16-09-2024", "16/09/2024". */
export function firstDate(s: string): string | null {
  const cands: { at: number; d: string | null }[] = [];
  const a = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/i);
  if (a) cands.push({ at: a.index!, d: iso(+a[3], mon(a[1]), +a[2]) });
  const b = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})/i);
  if (b) cands.push({ at: b.index!, d: iso(+b[3], mon(b[2]), +b[1]) });
  const c = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (c) cands.push({ at: c.index!, d: iso(+c[3], +c[2], +c[1]) });
  const ok = cands.filter((x) => x.d).sort((x, y) => x.at - y.at);
  return ok[0]?.d ?? null;
}

const num = (s: string) => Number(s.replace(/,/g, ''));

export function parseDivNotice(raw: string): DivNotice {
  const text = raw
    .replace(/[–—]/g, '-')
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, ' ');
  let dps: number | null = null;
  let pct: number | null = null;
  let nil = false;
  let pctToo: number | null = null;
  const re = /dividend/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && dps == null) {
    const before = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    if (/unclaimed|unpaid|payable|income|withh|mandate|e-|register|regulation/.test(before)) continue;
    const win = text.slice(m.index, m.index + 240);
    if ((/nil\b/i.test(win.slice(0, 64)) && !/\d/.test(win.slice(0, 64))) || /\bnil\W{0,3}\s*(?:cash\s+)?$/i.test(before)) {
      nil = true;
      continue;
    }
    // the amount: "@ Rs. 15/- per share", "of Rs 8.50 per share", "at the rate of Rs. 10/- per share", "@ 134/- per share"
    const am = win.match(/(?:rs\.?|pkr|rupees|@|rate of|of)\s*(?:(?:rs\.?|pkr|rupees)\s*)?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/-|\/=)?\s*(?:\(\w+\)\s*)?per\s+(?:ordinary\s+)?share/i);
    if (am) {
      const head = win.slice(0, am.index!).toLowerCase();
      if (!/earning|eps|already paid|in addition|face value|each/.test(head)) {
        const v = num(am[1]);
        if (v > 0 && v < 5000) {
          dps = v;
          const after = win.slice(am.index! + am[0].length, am.index! + am[0].length + 40).match(/^\W{0,6}(?:i\.?\s?e\.?\W{0,3})?\(?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*%/i);
          const prior = win.slice(0, am.index!).match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*%\s*\(?\s*$/);
          pctToo = after ? num(after[1]) : prior ? num(prior[1]) : null;
        }
      }
    }
    if (dps == null && pct == null) {
      const pm = win.slice(0, 160).match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*%/);
      if (pm && !/bonus|right/i.test(win.slice(0, pm.index!))) pct = num(pm[1]);
    }
  }
  let closeFrom: string | null = null;
  const bc = text.match(/(?:remain|be|will be)\s+closed\s+(?:from|w\.?e\.?f\.?)\s+(.{0,60})/i) ?? text.match(/book closure[^.]{0,40}?from\s+(.{0,60})/i);
  if (bc) closeFrom = firstDate(bc[1]);
  return { dps, pct: dps == null ? pct : null, nil: nil && dps == null && pct == null, pctToo, closeFrom };
}
