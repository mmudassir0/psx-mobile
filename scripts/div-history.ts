/**
 * Ten years of cash dividends for the backtesting lab, read from PSX's own
 * announcements (financial results and dividend notices, most of them scanned,
 * so OCR), because PSX's payouts table only reaches back to late 2024.
 *   tsx scripts/div-history.ts <state dir> <picks cache dir>
 *
 * Resumable: <state dir>/divs.json keeps every company done so far, and a run
 * stops at BUDGET_MIN minutes. Each dividend is saved with its ex-date and the
 * yield it was on the raw price the day before, so the lab can put it in the
 * same adjusted rupees as its prices. Logs show counts and symbols (public
 * market data, nothing about anyone's holdings).
 */
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { fetchIndexConstituents, fetchRaw } from '../src/psx/api';
import { parseHistorical } from '../src/psx/parse';
import { exDate, parsePayouts } from '../src/analysis/dividends';
import { parseDivNotice, type DivNotice } from '../src/lab/divText';

const run = promisify(execFile);
const [stateDir, cacheDir] = process.argv.slice(2);
const BUDGET = Date.now() + Number(process.env.BUDGET_MIN ?? 300) * 60_000;
/** VALIDATE=1: read the notices PSX's payouts table also covers (late 2024 on) and report how often the reading agrees */
const VALIDATE = !!process.env.VALIDATE;
const FROM = VALIDATE ? '2024-11-20' : '2016-07-01';
const TO = VALIDATE ? new Date().toISOString().slice(0, 10) : '2024-12-31';
const MAX = Number(process.env.MAX_SYMBOLS ?? 230);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (e) {
      last = e;
      await sleep(3000 * (i + 1));
    }
  }
  throw last;
}

export interface DivRow {
  /** ex-date YYYY-MM-DD */
  ex: string;
  /** Rs per share on the shares of that time */
  dps: number;
  /** dps ÷ the raw close the day before the ex-date */
  y: number;
  /** r: read from an announcement, p: PSX payouts table */
  src: 'r' | 'p';
  /** ex-date guessed from the announcement date (no book closure found) */
  approx?: 1;
}
/** bumped when the reading improves: companies read with an older version are read again (their old dividends stay until then) */
const READER = 2;
interface SymState {
  done: boolean;
  /** READER version this company was read with */
  v?: number;
  notices: number;
  read: number;
  fv: number;
  list: DivRow[];
  /** adjusted ÷ raw price from each day on (bonus issues and splits since), when it changes */
  fac?: [string, number][];
}
interface State {
  updated: string;
  from: string;
  symbols: Record<string, SymState>;
  shariah?: string[];
  kmi30?: string[];
  kse100?: string[];
}

const strip = (h: string) =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const annDay = (s: string) => {
  const m = s.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()));
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
};
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

interface Notice {
  day: string;
  title: string;
  pdf: string;
}

async function notices(sym: string): Promise<Notice[]> {
  const out: Notice[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const h = await retry(() => fetchRaw('/announcements', { type: 'C', symbol: sym, query: '', count: '100', offset: String(offset), date_from: FROM, date_to: TO, page: 'annc' }));
    const rows = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
    let n = 0;
    for (const r of rows) {
      const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
      if (cells.length < 5) continue;
      n++;
      const day = annDay(strip(cells[0]));
      const title = strip(cells[4]);
      const pdf = (cells[5] ?? '').match(/document\/(\d+)\.pdf/)?.[1];
      if (day && pdf) out.push({ day, title, pdf });
    }
    const total = Number(h.match(/of (\d+) entries/)?.[1] ?? 0);
    if (!n || offset + 100 >= total) break;
    await sleep(400);
  }
  return out;
}

const WANT = /financial results|dividend|material information|results of (the )?board|outcome of (the )?board|book closure|closure of (the )?(share )?transfer|entitlement|^\s*board meeting\b/i;
/** "other than financial results" intimations only give the meeting date; their "results of the board meeting" follow-ups carry interim dividends */
const PRE_MEETING = /other th[ae]n financial/i;
const SKIP =
  /credit of|dispatch|payment of|publication|unclaimed|withh|mandate|e-dividend|zakat|revoked|sukuk|tfc|term finance|profit payment|principal|transmission|cdc|iban|closed period|annual report|agm|general meeting|unpaid/i;

/** OCR that came out as noise (a page scanned sideways, or a photo): hardly any of the little words every English page has */
const LITTLE = new Set(['the', 'of', 'and', 'to', 'in', 'for', 'is', 'on', 'at', 'by', 'with', 'as', 'from', 'this', 'that', 'be', 'are', 'has', 'have', 'per', 'share', 'company', 'year', 'ended', 'profit', 'total']);
export const garbled = (t: string) => {
  const toks = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (toks.length < 40) return false;
  return toks.filter((x) => LITTLE.has(x)).length / toks.length < 0.04;
};

async function readPdf(id: string, dir: string, pages = 2): Promise<string> {
  const f = join(dir, `${id}.pdf`);
  const res = await retry(async () => {
    const r = await fetch(`https://dps.psx.com.pk/download/document/${id}.pdf`, { headers: { 'User-Agent': 'Mozilla/5.0 (Sahm lab data)' }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`pdf ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }, 3);
  writeFileSync(f, res);
  let text = '';
  try {
    text = (await run('pdftotext', ['-layout', '-l', '3', f, '-'], { timeout: 30_000, maxBuffer: 8e6 })).stdout;
  } catch {
    // not a text PDF
  }
  if (text.replace(/\s/g, '').length < 120) {
    text = '';
    // scanned: page by page until the dividend and its book closure are found (results often put the
    // board's letter after the statements, so those get more pages)
    for (let pg = 1; pg <= pages; pg++) {
      try {
        const out = join(dir, `${id}-p${pg}`);
        await run('pdftoppm', ['-r', '150', '-gray', '-png', '-singlefile', '-f', String(pg), '-l', String(pg), f, out], { timeout: 60_000 });
        const ocr = (psm: string) => run('tesseract', [`${out}.png`, '-', '--psm', psm], { timeout: 60_000, maxBuffer: 8e6, env: { ...process.env, OMP_THREAD_LIMIT: '1' } }).then((r) => r.stdout);
        let page = await ocr('6');
        // a page scanned sideways reads as noise: let tesseract find the orientation itself
        if (garbled(page)) page = await ocr('1').catch(() => page);
        text += page + '\n';
        rmSync(`${out}.png`, { force: true });
      } catch {
        break;
      }
      const d = parseDivNotice(text);
      // page 2 often has the book closure the amount on page 1 needs
      if (d.nil || ((d.dps != null || d.pct != null) && d.closeFrom)) break;
    }
  }
  rmSync(f, { force: true });
  return text;
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const i = k++;
        out[i] = await f(items[i]);
      }
    }),
  );
  return out;
}

function rawCloses(html: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of parseHistorical(html)) if (c.c > 0) m.set(new Date(c.t + 5 * 3600_000).toISOString().slice(0, 10), c.c);
  return m;
}
/** the raw close on the last trading day before `ex` */
function closeBefore(m: Map<string, number>, days: string[], ex: string): number | null {
  let lo = 0,
    hi = days.length - 1,
    r = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < ex) {
      r = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return r >= 0 ? m.get(days[r])! : null;
}

function universe(): string[] {
  const idx = existsSync(join(cacheDir, '..', 'indexes.json')) ? (JSON.parse(readFileSync(join(cacheDir, '..', 'indexes.json'), 'utf8')) as Record<string, string[]>) : {};
  const core = new Set([...(idx.KSE100 ?? []), ...(idx.KMI30 ?? [])]);
  const liq: { s: string; v: number }[] = [];
  for (const f of readdirSync(cacheDir).filter((x) => x.startsWith('daily_3A'))) {
    const sym = decodeURIComponent(f.slice(0, -5).replace(/_/g, '%')).replace(/^daily:/, '');
    try {
      const bars = (JSON.parse(readFileSync(join(cacheDir, f), 'utf8')).data?.bars ?? []) as number[][];
      // median traded value a day over each year, best year counts (stocks that were liquid at some point)
      let best = 0;
      for (let k = 0; k + 250 <= bars.length; k += 250) {
        const v = bars
          .slice(k, k + 250)
          .map((b) => b[4] * b[5])
          .sort((a, b) => a - b)[125];
        best = Math.max(best, v);
      }
      liq.push({ s: sym, v: best });
    } catch {
      // unreadable
    }
  }
  liq.sort((a, b) => b.v - a.v);
  const out = [...core];
  for (const x of liq) if (out.length < MAX && !core.has(x.s) && x.v >= 3e6) out.push(x.s);
  return out;
}

async function main() {
  const shard = Number(process.env.SHARD ?? 0);
  const shards = Number(process.env.SHARDS ?? 1);
  mkdirSync(stateDir, { recursive: true });
  const tmp = '/tmp/divpdf';
  mkdirSync(tmp, { recursive: true });
  const file = join(stateDir, process.env.SHARDS ? `divs-${shard}.json` : 'divs.json');
  const base = join(stateDir, 'divs.json');
  const st: State = existsSync(base) ? JSON.parse(readFileSync(base, 'utf8')) : { updated: '', from: FROM, symbols: {} };
  for (const [code, key] of [
    ['KMIALLSHR', 'shariah'],
    ['KMI30', 'kmi30'],
    ['KSE100', 'kse100'],
  ] as const) {
    try {
      st[key] = (await retry(() => fetchIndexConstituents(code))).map((c) => c.symbol);
    } catch (e) {
      console.log(`${code}: ${(e as Error).message}`);
    }
  }
  const syms: string[] = (process.env.ONLY ? process.env.ONLY.split(',') : universe()).filter((_: string, k: number) => k % shards === shard);
  const isDone = (s: string) => !!st.symbols[s]?.done && (st.symbols[s].v ?? 1) >= READER;
  console.log(`${syms.length} companies, ${syms.filter(isDone).length} already done`);
  let did = 0;
  for (const sym of syms) {
    if (isDone(sym) && !process.env.ONLY) continue;
    if (Date.now() > BUDGET) {
      console.log('time budget reached');
      break;
    }
    const t0 = Date.now();
    try {
      const all = await notices(sym);
      const want = all.filter((n) => WANT.test(n.title) && !SKIP.test(n.title) && !(PRE_MEETING.test(n.title) && !/material information|results of|outcome/i.test(n.title)));
      if (process.env.ONLY) console.log(`  ${sym}: ${all.length} notices listed in ${Math.round((Date.now() - t0) / 1000)}s, ${want.length} to read`);
      // the test run lists every notice in the window, read or not, to see where a missed dividend was announced
      if (VALIDATE) for (const n of all.filter((x) => x.day >= FROM)) console.log(`    ${want.includes(n) ? 'READ' : 'skip'} ${n.day} ${n.title.slice(0, 90)}`);
      const read = await pool(want, Number(process.env.OCR_POOL ?? 4), async (n) => {
        try {
          const t1 = Date.now();
          const text = await readPdf(n.pdf, tmp, /financial results|board meeting/i.test(n.title) ? 5 : 2);
          const d = parseDivNotice(text);
          if (process.env.DUMP_DIR) {
            mkdirSync(process.env.DUMP_DIR, { recursive: true });
            writeFileSync(`${process.env.DUMP_DIR}/${sym}-${n.day}-${n.pdf.replace(/\D/g, '')}.txt`, `${n.title}\n\n${text}`);
          }
          if (process.env.DUMP && d.dps == null && d.pct == null && !d.nil)
            console.log(
              `    ---- ${n.day} ${n.pdf}\n${text
                .split('\n')
                .filter((l) => /dividend|per share|closed|book/i.test(l))
                .slice(0, 12)
                .map((l) => '      | ' + l.trim().slice(0, 160))
                .join('\n')}`,
            );
          if (process.env.ONLY)
            console.log(
              `    ${n.day} ${n.title.slice(0, 60)} | ${Math.round((Date.now() - t1) / 1000)}s ${text.length}ch -> ${d.nil ? 'NIL' : (d.dps ?? (d.pct != null ? d.pct + '%' : '?'))} ${d.kind ?? ''} bc ${d.closeFrom ?? '-'}`,
            );
          return { n, d };
        } catch {
          return { n, d: null as DivNotice | null };
        }
      });
      // face value from notices that give both Rs and %: Rs 7 per share i.e. 70% -> Rs 10
      const fvs = read.filter((x) => x.d?.dps && x.d.pctToo).map((x) => Math.round((x.d!.dps! / x.d!.pctToo!) * 100 * 100) / 100);
      const fv = [10, 5, 2, 1, 100].find((f) => fvs.filter((v) => Math.abs(v - f) < 0.01).length > fvs.length / 2) ?? 10;
      const raw = rawCloses(await retry(() => fetchRaw('/historical', { month: '0', year: '0', symbol: sym })));
      // without prices the yields can't be worked out: leave the company for the next run rather than save it empty
      if (raw.size < 100) throw new Error('no price history from PSX');
      const days = [...raw.keys()].sort();
      const found: { day: string; dps: number; bc: string | null; final: boolean }[] = [];
      for (const x of read) {
        const d = x.d;
        if (!d) continue;
        const dps = d.dps ?? (d.pct != null ? (d.pct / 100) * fv : null);
        if (!dps) continue;
        // final dividends wait for the shareholders' meeting: the notice says so, or it's the full-year results
        const final = d.kind ? d.kind === 'final' : /year ended|annual/i.test(x.n.title) && !/half|quarter|months|interim/i.test(x.n.title);
        found.push({ day: x.n.day, dps, bc: d.closeFrom && d.closeFrom >= x.n.day && d.closeFrom <= addDays(x.n.day, 100) ? d.closeFrom : null, final });
      }
      found.sort((a, b) => (a.day < b.day ? -1 : 1));
      // the same dividend in a results notice and a book-closure notice: keep one, with a book closure if any has it
      const merged: typeof found = [];
      for (const f of found) {
        const same = merged.find((m) => Math.abs(m.dps - f.dps) < 0.011 && Math.abs(Date.parse(m.day) - Date.parse(f.day)) < 50 * 864e5);
        if (same) {
          if (!same.bc && f.bc) same.bc = f.bc;
          same.final ||= f.final;
        } else merged.push({ ...f });
      }
      // without a book closure date, the ex-date is guessed from this company's usual gap between notice and ex-date,
      // kept apart for final dividends (after the shareholders' meeting: weeks later) and interim ones
      const exOf = (bc: string) => new Date(exDate(Date.parse(bc + 'T07:00:00Z')) + 5 * 3600_000).toISOString().slice(0, 10);
      const gapsOf = (final: boolean) =>
        merged
          .filter((m) => m.bc && m.final === final)
          .map((m) => Math.round((Date.parse(exOf(m.bc!)) - Date.parse(m.day)) / 864e5))
          .filter((g) => g > 0 && g < 95)
          .sort((a, b) => a - b);
      const median = (g: number[]) => (g.length >= 2 ? g[Math.floor(g.length / 2)] : g.length === 1 ? g[0] : null);
      const gapFinal = median(gapsOf(true));
      const gapInterim = median(gapsOf(false)) ?? 14;
      // a final without this company's own history: June year-ends hold the meeting in October (results Aug-Oct), others about 3-4 weeks on
      const guessDays = (m: (typeof merged)[number]) => {
        if (!m.final) return gapInterim;
        if (gapFinal != null) return gapFinal;
        const mon = +m.day.slice(5, 7);
        return mon >= 7 && mon <= 10 ? 50 : 26;
      };
      const list: DivRow[] = [];
      const truth: { ex: string; dps: number }[] = [];
      for (const m of merged) {
        const ex = m.bc ? exOf(m.bc) : addDays(m.day, guessDays(m));
        const c = closeBefore(raw, days, ex);
        const y = c ? m.dps / c : NaN;
        if (!c || !(y > 0 && y < 0.5)) {
          if (VALIDATE) console.log(`    dropped ${m.dps}@${ex}: close before ${c ?? 'none'} (prices ${days[0]}..${days[days.length - 1]})`);
          continue;
        }
        list.push({ ex, dps: Math.round(m.dps * 100) / 100, y: Math.round(y * 1e5) / 1e5, src: 'r', ...(m.bc ? {} : { approx: 1 as const }) });
      }
      // late 2024 onwards: PSX's payouts table, saved by the daily job
      const pf = join(cacheDir, `payouts_3A${encodeURIComponent(sym).replace(/%/g, '_')}.json`);
      if (existsSync(pf)) {
        const payouts = (JSON.parse(readFileSync(pf, 'utf8')).data ?? []) as ReturnType<typeof parsePayouts>;
        for (const p of payouts) {
          const pct = p.items.filter((i) => i.type === 'D').reduce((s, i) => s + i.pct, 0);
          if (!pct || !p.bookClosure) continue;
          const ex = new Date(exDate(p.bookClosure) + 5 * 3600_000).toISOString().slice(0, 10);
          if (VALIDATE) {
            if (ex >= '2024-12-10' && ex <= TO) truth.push({ ex, dps: (pct / 100) * fv });
            continue;
          }
          if (ex <= TO) continue;
          const c = closeBefore(raw, days, ex);
          const dps = (pct / 100) * fv;
          if (c && dps / c < 0.5) list.push({ ex, dps: Math.round(dps * 100) / 100, y: Math.round((dps / c) * 1e5) / 1e5, src: 'p' });
        }
      }
      list.sort((a, b) => (a.ex < b.ex ? -1 : 1));
      // the same dividend found twice (results notice and a later dividend notice): keep the one with a real book closure
      const dedup: DivRow[] = [];
      for (const r of list) {
        const k = dedup.findIndex((d) => Math.abs(d.dps - r.dps) <= Math.max(0.011, d.dps * 0.01) && Math.abs(Date.parse(d.ex) - Date.parse(r.ex)) < 45 * 864e5);
        if (k < 0) dedup.push(r);
        else if (dedup[k].approx && !r.approx) dedup[k] = r;
      }
      list.length = 0;
      list.push(...dedup);
      if (VALIDATE) {
        // compare the reading with PSX's own table
        const used = new Set<number>();
        let ok = 0,
          wrongAmount = 0,
          wrongDate = 0;
        const notes: string[] = [];
        for (const t of truth) {
          const k = list.findIndex((r, i) => !used.has(i) && Math.abs(Date.parse(r.ex) - Date.parse(t.ex)) <= 40 * 864e5 && Math.abs(r.dps - t.dps) <= Math.max(0.02, t.dps * 0.02));
          if (k >= 0) {
            used.add(k);
            if (Math.abs(Date.parse(list[k].ex) - Date.parse(t.ex)) <= 7 * 864e5) ok++;
            else {
              wrongDate++;
              notes.push(`date ${list[k].ex} vs ${t.ex}${list[k].approx ? ' (guessed)' : ''}`);
            }
            continue;
          }
          const near = list.findIndex((r, i) => !used.has(i) && Math.abs(Date.parse(r.ex) - Date.parse(t.ex)) <= 20 * 864e5);
          if (near >= 0) {
            used.add(near);
            wrongAmount++;
            notes.push(`amount ${list[near].dps} vs ${t.dps.toFixed(2)} on ${t.ex}`);
          } else notes.push(`missed ${t.dps.toFixed(2)} on ${t.ex}`);
        }
        const extra = list.filter((_, i) => !used.has(i)).map((r) => `${r.dps}@${r.ex}`);
        console.log(
          `VALIDATE ${sym}: ${truth.length} paid, ${ok} right, ${wrongDate} late date, ${wrongAmount} wrong amount, ${truth.length - ok - wrongDate - wrongAmount} missed, ${extra.length} extra | ${notes.join('; ')}${extra.length ? ` | extra ${extra.join(', ')}` : ''}`,
        );
      }
      // how the saved (adjusted) prices relate to the raw ones over time, for earnings per share
      const fac: [string, number][] = [];
      const df = join(cacheDir, `daily_3A${encodeURIComponent(sym).replace(/%/g, '_')}.json`);
      if (existsSync(df)) {
        const bars = (JSON.parse(readFileSync(df, 'utf8')).data?.bars ?? []) as number[][];
        for (const b of bars) {
          const d = new Date(b[0] + 5 * 3600_000).toISOString().slice(0, 10);
          const r = raw.get(d);
          if (!r || !(b[4] > 0)) continue;
          const f = Math.round((b[4] / r) * 1e4) / 1e4;
          if (!fac.length || Math.abs(f / fac[fac.length - 1][1] - 1) > 0.01) fac.push([d, f]);
        }
      }
      st.symbols[sym] = { done: true, v: READER, notices: want.length, read: read.filter((x) => x.d && (x.d.dps || x.d.pct || x.d.nil)).length, fv, list, fac };
      did++;
      if (process.env.ONLY) console.log(list.map((r) => `${r.ex} ${r.dps} ${(r.y * 100).toFixed(2)}% ${r.src}${r.approx ? '~' : ''}`).join(' | '));
      console.log(`${sym}: ${want.length} notices, ${st.symbols[sym].read} understood, ${list.length} dividends, fv ${fv}, ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      console.log(`${sym}: FAILED ${(e as Error).message}`);
    }
    st.updated = new Date().toISOString();
    writeFileSync(file, JSON.stringify(st));
  }
  const left = syms.filter((s) => !isDone(s)).length;
  writeFileSync(join(stateDir, process.env.SHARDS ? `left-${shard}.txt` : 'left.txt'), String(left));
  console.log(`done this run: ${did}, left: ${left}`);
}

main().catch((e) => {
  console.log('ERROR', e);
  process.exit(1);
});
