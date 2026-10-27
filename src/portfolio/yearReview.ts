/**
 * A tax year (1 July – 30 June) on one page: how the portfolio did against the index,
 * the best and worst holdings, dividends, sales and tax, and the decisions you made.
 */
import { flowBetween, trackReturns, alignIndex, type Snap } from './track';
import type { TaxStatement } from './taxStatement';
import type { SeriesPoint } from '../psx/types';

export interface YearTrade {
  day: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  realised: number | null;
}

export interface Mover {
  symbol: string;
  /** price change over the part of the year it was held, 0.12 = +12% */
  change: number;
  /** rupees: price change × shares held at the end of that span */
  rupees: number;
}

export interface YearReview {
  year: number;
  from: string;
  to: string;
  /** the year isn't over */
  partial: boolean;
  /** first and last snapshot used */
  start: string | null;
  end: string | null;
  startValue: number | null;
  endValue: number | null;
  /** money added (+) or taken out (−) over the year */
  added: number;
  ret: number | null;
  indexRet: number | null;
  best: Mover[];
  worst: Mover[];
  buys: { n: number; amount: number };
  sells: { n: number; amount: number; wins: number; losses: number };
  biggestSale: YearTrade | null;
  notes: number;
  st: TaxStatement;
}

export const taxYearRange = (year: number) => ({ from: `${year - 1}-07-01`, to: `${year}-06-30` });

export function yearReview(input: { year: number; today: string; snaps: Snap[]; trades: YearTrade[]; notesAt: string[]; st: TaxStatement; index: SeriesPoint[] | null }): YearReview {
  const { year } = input;
  const { from, to } = taxYearRange(year);
  // the snapshot just before the year (its close is the start), then those inside it
  const before = [...input.snaps].filter((s) => s.day < from).pop();
  const inside = input.snaps.filter((s) => s.day >= from && s.day <= to);
  const span = before ? [before, ...inside] : inside;
  let ret: number | null = null;
  let indexRet: number | null = null;
  let added = 0;
  if (span.length >= 2) {
    const tr = trackReturns(span);
    ret = tr[tr.length - 1].ret;
    for (let i = 1; i < span.length; i++) added += flowBetween(span[i - 1], span[i]);
    if (input.index?.length) {
      const v = alignIndex(input.index, [span[0].day, span[span.length - 1].day]);
      if (v[0] && v[1]) indexRet = v[1] / v[0] - 1;
    }
  }
  // holdings: first and last price seen in the span, shares at the last sighting
  const seen = new Map<string, { p0: number; p1: number; shares: number }>();
  for (const s of span)
    for (const [sym, [shares, , price]] of Object.entries(s.pos)) {
      if (!(price > 0) || !(shares > 0)) continue;
      const m = seen.get(sym);
      if (!m) seen.set(sym, { p0: price, p1: price, shares });
      else {
        m.p1 = price;
        m.shares = shares;
      }
    }
  const movers: Mover[] = [...seen].filter(([, m]) => m.p0 > 0 && m.p1 !== m.p0).map(([symbol, m]) => ({ symbol, change: m.p1 / m.p0 - 1, rupees: (m.p1 - m.p0) * m.shares }));
  const best = [...movers]
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 3);
  const worst = [...movers]
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 3);

  const yt = input.trades.filter((t) => t.day >= from && t.day <= to);
  const buys = yt.filter((t) => t.side === 'buy');
  const sells = yt.filter((t) => t.side === 'sell');
  const biggestSale = [...sells].filter((t) => t.realised != null).sort((a, b) => Math.abs(b.realised!) - Math.abs(a.realised!))[0] ?? null;
  return {
    year,
    from,
    to,
    partial: input.today <= to,
    start: span[0]?.day ?? null,
    end: span[span.length - 1]?.day ?? null,
    startValue: span[0]?.value ?? null,
    endValue: span[span.length - 1]?.value ?? null,
    added,
    ret,
    indexRet,
    best,
    worst,
    buys: { n: buys.length, amount: buys.reduce((a, t) => a + t.shares * t.price, 0) },
    sells: { n: sells.length, amount: sells.reduce((a, t) => a + t.shares * t.price, 0), wins: sells.filter((t) => (t.realised ?? 0) > 0).length, losses: sells.filter((t) => (t.realised ?? 0) < 0).length },
    biggestSale,
    notes: input.notesAt.filter((d) => d >= from && d <= to).length,
    st: input.st,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rs = (v: number) => `${v < 0 ? '−' : ''}Rs ${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const pc = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);

/** One printable page. */
export function reviewHtml(r: YearReview, opts: { name?: string | null; bench: string; made: string }): string {
  const mv = (l: Mover[]) => l.map((m) => `<tr><td>${esc(m.symbol)}</td><td class=r>${pc(m.change)}</td><td class=r>${rs(m.rupees)}</td></tr>`).join('') || '<tr><td colspan=3>–</td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#111;margin:28px;font-size:13px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
.sub{color:#666;margin-bottom:14px}.big{font-size:26px;font-weight:700}.grid{display:flex;gap:28px;flex-wrap:wrap}
table{border-collapse:collapse;width:100%}td,th{padding:5px 6px;border-bottom:1px solid #eee;text-align:left}.r{text-align:right}
.up{color:#0a7d4f}.down{color:#c0392b}.note{color:#777;font-size:11px;margin-top:22px}
</style></head><body>
<h1>Tax year ${r.year - 1}–${String(r.year).slice(2)} in review${r.partial ? ' (so far)' : ''}</h1>
<div class=sub>${opts.name ? esc(opts.name) + ' · ' : ''}${r.from} to ${r.partial ? (r.end ?? r.to) : r.to} · made ${esc(opts.made)} with Sahm</div>
<div class=grid>
<div><div>Your return</div><div class="big ${(r.ret ?? 0) >= 0 ? 'up' : 'down'}">${pc(r.ret)}</div></div>
<div><div>${esc(opts.bench)}</div><div class=big>${pc(r.indexRet)}</div></div>
<div><div>Portfolio value</div><div class=big>${r.endValue != null ? rs(r.endValue) : '–'}</div></div>
</div>
<p>${r.startValue != null ? `From ${rs(r.startValue)}, with ${rs(r.added)} ${r.added >= 0 ? 'added' : 'taken out'} during the year.` : ''}</p>
<h2>Best holdings</h2><table><tr><th>Stock</th><th class=r>Price change</th><th class=r>On your shares</th></tr>${mv(r.best)}</table>
<h2>Worst holdings</h2><table><tr><th>Stock</th><th class=r>Price change</th><th class=r>On your shares</th></tr>${mv(r.worst)}</table>
<h2>Income and tax</h2><table>
<tr><td>Cash dividends (before tax)</td><td class=r>${rs(r.st.divGross)}</td></tr>
<tr><td>Tax withheld on dividends</td><td class=r>${rs(r.st.divWithheld)}</td></tr>
<tr><td>Gains on shares sold</td><td class=r>${rs(r.st.gains)}</td></tr>
<tr><td>Losses on shares sold</td><td class=r>${rs(-r.st.losses)}</td></tr>
<tr><td>Capital gains tax (estimate)</td><td class=r>${rs(r.st.cgt)}</td></tr></table>
<h2>Your decisions</h2><table>
<tr><td>Buys</td><td class=r>${r.buys.n} (${rs(r.buys.amount)})</td></tr>
<tr><td>Sales</td><td class=r>${r.sells.n} (${rs(r.sells.amount)}): ${r.sells.wins} at a profit, ${r.sells.losses} at a loss</td></tr>
${r.biggestSale ? `<tr><td>Biggest sale result</td><td class=r>${esc(r.biggestSale.symbol)} ${r.biggestSale.day}: ${rs(r.biggestSale.realised!)}</td></tr>` : ''}
<tr><td>Notes written</td><td class=r>${r.notes}</td></tr></table>
<div class=note>Returns are worked out from Sahm's daily snapshots (money added or taken out isn't counted as gain), with cash dividends before tax. Trades are those recorded in Sahm. Estimates, not tax advice.</div>
</body></html>`;
}
