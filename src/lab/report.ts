/** A one-page report of a lab strategy, as HTML for printing to PDF. Pure: no React Native. */
import type { Lab } from './data';
import type { Result, Strategy } from './engine';
import { describe } from './describe';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pc = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;

function line(values: ArrayLike<number>, w: number, h: number, lo: number, hi: number, log: boolean): string {
  const n = values.length;
  const step = Math.max(1, Math.ceil(n / 260));
  const f = (v: number) => (log ? Math.log(Math.max(v, 1e-9)) : v);
  let d = '';
  for (let i = 0; i < n; i += step) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const x = (i / Math.max(1, n - 1)) * w;
    const y = h - ((f(v) - f(lo)) / (f(hi) - f(lo) || 1)) * h;
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function labReportHtml(lab: Lab, st: Strategy, r: Result, made: string): string {
  const days = lab.days.slice(r.start);
  const g = Array.from(r.growth, (v) => v * 100);
  const b = Array.from(r.benchGrowth, (v) => v * 100);
  const all = [...g, ...b].filter((v) => v > 0);
  const lo = Math.min(...all),
    hi = Math.max(...all);
  const W = 640,
    H = 220;
  const years: string[] = [];
  for (let i = 1; i < days.length; i++)
    if (days[i].slice(0, 4) !== days[i - 1].slice(0, 4)) {
      const x = (i / (days.length - 1)) * W;
      years.push(`<line x1="${x}" x2="${x}" y1="${H}" y2="${H + 5}" stroke="#999"/><text x="${x - 8}" y="${H + 16}" font-size="10" fill="#666">${days[i].slice(0, 4)}</text>`);
    }
  const benchName = st.bench === 'KMI30' ? 'KMI-30' : 'KSE-100';
  const s = r.stats;
  const yearRows = r.years
    .map(
      (y) =>
        `<tr><td>${y.year}</td><td class="n ${y.ret >= 0 ? 'up' : 'down'}">${pc(y.ret, 0)}</td><td class="n">${pc(y.bench, 0)}</td><td class="n ${y.ret - y.bench >= 0 ? 'up' : 'down'}">${pc(y.ret - y.bench, 0)}</td></tr>`,
    )
    .join('');
  const holds = r.holdings.length ? r.holdings.map((h) => `${esc(h.symbol)} (${pc(h.value / h.cost - 1, 0)})`).join(', ') : 'Nothing: all in cash';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:28px;font-size:12px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#555;margin-bottom:14px;line-height:1.45}
  .big{font-size:26px;font-weight:800} .grid{display:flex;flex-wrap:wrap;margin:10px 0}
  .grid div{width:25%;padding:6px 0} .k{color:#666;font-size:10.5px} .v{font-weight:700;font-size:14px}
  table{border-collapse:collapse;width:100%;margin-top:6px} td,th{padding:4px 6px;border-bottom:1px solid #eee;text-align:left} .n{text-align:right}
  .up{color:#0E9F6E} .down{color:#C82333} h2{font-size:14px;margin:18px 0 4px} .foot{color:#777;font-size:10px;margin-top:16px;line-height:1.5}
  </style></head><body>
  <h1>${esc(st.name)}</h1>
  <div class="sub">${esc(describe(st))}<br/>From ${days[0]} to ${days[days.length - 1]} · ${rs(s.put)} put in · costs ${st.costs ? 'counted' : 'left out'} · tax: ${st.tax === 'none' ? 'left out' : st.tax}</div>
  <div class="big">${rs(s.final)}</div>
  <div><b class="${s.cagr >= 0 ? 'up' : 'down'}">${pc(s.cagr)} a year</b> against ${pc(s.benchCagr)} for the ${benchName} with its dividends (the same money there: ${rs(r.bench[r.bench.length - 1])}).</div>
  <h2>Rs 100 grew to</h2>
  <svg width="${W + 10}" height="${H + 22}" viewBox="0 0 ${W + 10} ${H + 22}">
    <path d="${line(b, W, H, lo, hi, true)}" stroke="#97A3B2" stroke-width="1.5" fill="none"/>
    <path d="${line(g, W, H, lo, hi, true)}" stroke="#B9811C" stroke-width="2.2" fill="none"/>
    ${years.join('')}
  </svg>
  <div class="k"><span style="color:#B9811C">━</span> Strategy ${g[g.length - 1].toFixed(0)} · <span style="color:#97A3B2">━</span> ${benchName} ${b[b.length - 1].toFixed(0)} · even scale</div>
  <div class="grid">
    <div><div class="k">Worst fall</div><div class="v down">${pc(s.maxDrop, 0)}</div><div class="k">${benchName} ${pc(s.benchMaxDrop, 0)}</div></div>
    <div><div class="k">A year on your money</div><div class="v">${s.irr != null ? pc(s.irr) : '–'}</div></div>
    <div><div class="k">Ups and downs</div><div class="v">${(s.vol * 100).toFixed(0)}% a year</div></div>
    <div><div class="k">Months ahead of the index</div><div class="v">${Math.round(s.monthsAhead * 100)}%</div></div>
    <div><div class="k">Dividends received</div><div class="v">${rs(s.dividends)}</div></div>
    <div><div class="k">Costs and tax</div><div class="v">${rs(s.costs + s.tax)}</div></div>
    <div><div class="k">Trades</div><div class="v">${r.trades.length}</div></div>
    <div><div class="k">Sales at a profit</div><div class="v">${s.winRate != null ? Math.round(s.winRate * 100) + '%' : '–'}</div></div>
  </div>
  <h2>Year by year</h2>
  <table><tr><th>Year</th><th class="n">Strategy</th><th class="n">${benchName}</th><th class="n">Difference</th></tr>${yearRows}</table>
  <h2>What it would hold now</h2><div>${holds}</div>
  <div class="foot">Made with Sahm's backtesting lab on ${esc(made)}. Each check uses only the closes known the day before and trades at that day's close; costs 0.2% each way; dividends on the ex-date after tax; the index's dividends are estimated from what its members paid. Today's index lists are used for the whole period and delisted stocks aren't in the data, which flatters every strategy a little. The past doesn't promise the future. Information, not advice.</div>
  </body></html>`;
}
