/**
 * A tax-year statement (July to June) for filing: share sales with their gain
 * or loss and the capital gains tax, and cash dividends with the tax
 * withheld. Built from what Sahm knows:
 *
 * - Sales: the ones recorded with "Bought or sold" (price and average cost).
 * - Dividends: each payout of the stocks you hold, on the shares you held at
 *   book closure. Those come from your recorded trades when there are any for
 *   that stock, otherwise from Sahm's daily snapshots, otherwise today's
 *   shares (marked as assumed). Stocks sold out before today aren't covered.
 *
 * The broker's and NCCPL's own statements are the official record; this is a
 * check and a summary.
 */
import { cgtRate, type Bought } from './tax';
import { dividendTaxRate, payerKind, type Dividends, type TaxStatus } from '../analysis/dividends';
import type { TradeRecord } from './trades';
import { taxYearOf } from './trades';

const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export interface SaleLine {
  day: string;
  symbol: string;
  shares: number;
  price: number;
  avgCost: number;
  gain: number;
  rate: number;
  tax: number;
}

export interface DividendLine {
  day: string;
  symbol: string;
  shares: number;
  dps: number;
  gross: number;
  rate: number;
  withheld: number;
  net: number;
  /** shares taken from today's holding, not known for that day */
  assumed: boolean;
}

export interface TaxStatement {
  year: number;
  from: string;
  to: string;
  sales: SaleLine[];
  gains: number;
  losses: number;
  net: number;
  /** capital gains tax on the net gain (losses set off first), at each sale's rate */
  cgt: number;
  dividends: DividendLine[];
  divGross: number;
  divWithheld: number;
  divNet: number;
  /** stocks whose dividend shares were assumed from today's holding */
  assumed: string[];
}

export interface StatementHolding {
  symbol: string;
  shares: number;
  sector: string | null;
  dividends: Dividends | null;
}

/** Shares of `symbol` held at the end of `day` from the recorded trades, or null when none were recorded before then. */
export function sharesFromTrades(trades: TradeRecord[], symbol: string, day: string, today: number): number | null {
  const mine = trades.filter((t) => t.symbol === symbol).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!mine.length) return null;
  // today's holding, walked back through the trades made after `day`
  let shares = today;
  for (const t of mine) if (t.day > day) shares += t.side === 'buy' ? -t.shares : t.shares;
  return Math.max(0, shares);
}

export function taxStatement(input: {
  year: number;
  trades: TradeRecord[];
  holdings: StatementHolding[];
  status: TaxStatus;
  bought: Record<string, Bought>;
  /** shares held at the end of a day, from the daily snapshots, when known */
  snapshotShares?: (symbol: string, day: string) => number | null;
  heldYears?: number;
}): TaxStatement {
  const { year, trades, status } = input;
  const from = `${year - 1}-07-01`;
  const to = `${year}-06-30`;

  const sales: SaleLine[] = trades
    .filter((t) => t.side === 'sell' && t.realised != null && taxYearOf(t.day) === year)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((t) => {
      const { rate } = cgtRate(status, input.bought[t.symbol] ?? 'recent', input.heldYears ?? 0);
      return { day: t.day, symbol: t.symbol, shares: t.shares, price: t.price, avgCost: t.avgCost, gain: t.realised!, rate, tax: 0 };
    });
  const gains = sales.filter((s) => s.gain > 0).reduce((a, s) => a + s.gain, 0);
  const losses = sales.filter((s) => s.gain < 0).reduce((a, s) => a - s.gain, 0);
  // losses are set off against gains first, taking the tax off the highest-rate gains last
  let lossLeft = losses;
  for (const s of [...sales].filter((x) => x.gain > 0).sort((a, b) => a.rate - b.rate)) {
    const used = Math.min(lossLeft, s.gain);
    lossLeft -= used;
    s.tax = (s.gain - used) * s.rate;
  }
  const cgt = sales.reduce((a, s) => a + s.tax, 0);

  const dividends: DividendLine[] = [];
  const assumed = new Set<string>();
  for (const h of input.holdings) {
    const rate = dividendTaxRate(status, payerKind(h.sector));
    for (const p of h.dividends?.list ?? []) {
      if (!(p.dps > 0) || p.bookClosure == null) continue;
      const day = pkDay(p.bookClosure);
      if (day < from || day > to) continue;
      // the register closes at the end of the day before book closure
      const before = pkDay(p.bookClosure - 864e5);
      let shares = sharesFromTrades(trades, h.symbol, before, h.shares);
      if (shares == null) shares = input.snapshotShares?.(h.symbol, before) ?? null;
      const isAssumed = shares == null;
      if (isAssumed) assumed.add(h.symbol);
      const n = shares ?? h.shares;
      if (!(n > 0)) continue;
      const gross = n * p.dps;
      dividends.push({ day, symbol: h.symbol, shares: n, dps: p.dps, gross, rate, withheld: gross * rate, net: gross * (1 - rate), assumed: isAssumed });
    }
  }
  dividends.sort((a, b) => (a.day < b.day ? -1 : 1));
  const divGross = dividends.reduce((a, d) => a + d.gross, 0);
  const divWithheld = dividends.reduce((a, d) => a + d.withheld, 0);
  return { year, from, to, sales, gains, losses, net: gains - losses, cgt, dividends, divGross, divWithheld, divNet: divGross - divWithheld, assumed: [...assumed] };
}

/** The shares held at the end of `day`, from the latest snapshot on or before it. */
export function snapshotLookup(snaps: { day: string; pos: Record<string, [number, number, number]> }[]) {
  const sorted = [...snaps].sort((a, b) => (a.day < b.day ? -1 : 1));
  return (symbol: string, day: string): number | null => {
    let found: number | null = null;
    for (const s of sorted) {
      if (s.day > day) break;
      found = s.pos[symbol]?.[0] ?? 0;
    }
    return found;
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;

/** The statement as a printable page (for the PDF). */
export function statementHtml(s: TaxStatement, opts: { name?: string | null; status: TaxStatus; made: string }): string {
  const sale = s.sales
    .map((x) => `<tr><td>${x.day}</td><td>${esc(x.symbol)}</td><td class=r>${x.shares.toLocaleString('en-US')}</td><td class=r>${x.price.toFixed(2)}</td><td class=r>${x.avgCost.toFixed(2)}</td><td class="r ${x.gain < 0 ? 'neg' : ''}">${rs(x.gain)}</td><td class=r>${pct(x.rate)}</td><td class=r>${rs(x.tax)}</td></tr>`)
    .join('');
  const div = s.dividends
    .map((d) => `<tr><td>${d.day}</td><td>${esc(d.symbol)}${d.assumed ? ' *' : ''}</td><td class=r>${d.shares.toLocaleString('en-US')}</td><td class=r>${d.dps.toFixed(2)}</td><td class=r>${rs(d.gross)}</td><td class=r>${pct(d.rate)}</td><td class=r>${rs(d.withheld)}</td><td class=r>${rs(d.net)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#111;margin:28px;font-size:12px}
  h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;margin:22px 0 6px} .muted{color:#666}
  table{width:100%;border-collapse:collapse;margin-top:4px} th,td{padding:5px 6px;border-bottom:1px solid #ddd;text-align:left}
  th{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.3px} .r{text-align:right} .neg{color:#b42318}
  .tot td{font-weight:700;border-top:2px solid #111} .box{display:flex;gap:28px;margin-top:10px} .box div b{display:block;font-size:16px}
  </style></head><body>
  <h1>Share income statement, tax year ${s.year}</h1>
  <div class=muted>${s.from} to ${s.to}${opts.name ? ` · ${esc(opts.name)}` : ''} · ${opts.status === 'filer' ? 'Filer (on the Active Taxpayers List)' : 'Non-filer'} · made by Sahm on ${opts.made}</div>
  <div class=box>
    <div>Net capital gain<b>${rs(s.net)}</b></div><div>Capital gains tax (est.)<b>${rs(s.cgt)}</b></div>
    <div>Cash dividends<b>${rs(s.divGross)}</b></div><div>Tax withheld on dividends<b>${rs(s.divWithheld)}</b></div>
  </div>
  <h2>Shares sold</h2>
  ${s.sales.length ? `<table><tr><th>Date</th><th>Stock</th><th class=r>Shares</th><th class=r>Price</th><th class=r>Avg cost</th><th class=r>Gain / loss</th><th class=r>Rate</th><th class=r>Tax</th></tr>${sale}
  <tr class=tot><td colspan=5>Gains ${rs(s.gains)} · losses ${rs(s.losses)}</td><td class=r>${rs(s.net)}</td><td></td><td class=r>${rs(s.cgt)}</td></tr></table>` : '<div class=muted>No sales recorded in Sahm for this tax year.</div>'}
  <h2>Cash dividends</h2>
  ${s.dividends.length ? `<table><tr><th>Book closure</th><th>Stock</th><th class=r>Shares</th><th class=r>Per share</th><th class=r>Gross</th><th class=r>Rate</th><th class=r>Withheld</th><th class=r>Received</th></tr>${div}
  <tr class=tot><td colspan=4>Total</td><td class=r>${rs(s.divGross)}</td><td></td><td class=r>${rs(s.divWithheld)}</td><td class=r>${rs(s.divNet)}</td></tr></table>` : '<div class=muted>No cash dividends found for your holdings in this tax year.</div>'}
  <p class=muted style="margin-top:22px;line-height:1.5">
  ${s.assumed.length ? `* Shares at book closure not known (no trades or daily snapshot from then): today's holding was used for ${esc(s.assumed.join(', '))}.<br>` : ''}
  Sales are the ones recorded in Sahm; dividends cover the stocks you hold now, so any stock sold out earlier is missing. Capital gains tax is an estimate:
  NCCPL works out and collects the actual tax, and your broker's and NCCPL's annual statements are the official record for your return.
  Brokerage and other charges are not deducted.</p>
  </body></html>`;
}
