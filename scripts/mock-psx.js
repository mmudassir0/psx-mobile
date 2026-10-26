/**
 * A stand-in for dps.psx.com.pk built from the saved pages in scripts/fixtures,
 * for looking at screens in the web preview where the real site can't be
 * reached. Every symbol gets LUCK's pages with its prices bent by a
 * per-symbol curve, so charts and comparisons differ between stocks.
 *
 *   node scripts/mock-psx.js 8098
 *   EXPO_PUBLIC_PSX_BASE=http://localhost:8098 npx expo export --platform web
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures');
const read = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const T0 = 1791543600;

/** The price multiplier for `sym` on day `t` (epoch seconds). LUCK is unchanged. */
function factor(sym, t) {
  if (sym === 'LUCK') return 1;
  const h = hash(sym);
  const level = 0.3 + (h % 170) / 100;
  const days = (T0 - t) / 86400;
  const trend = ((h >> 3) % 100) / 100 - 0.5; // -0.5…+0.5 over a year
  return level * (1 - (trend * days) / 365) * (1 + 0.12 * Math.sin(days / (12 + (h % 30)) + h));
}

function historical(sym) {
  const html = read('historical_LUCK.html');
  return html.replace(/<tr><td data-order="(\d+)">([^<]*)<\/td>(.*?)<\/tr>/g, (_, t, d, rest) => {
    const f = factor(sym, Number(t));
    const r = rest.replace(/<td class="right">([\d,]+\.\d+)<\/td>/g, (_m, v) => `<td class="right">${(Number(v.replace(/,/g, '')) * f).toFixed(2)}</td>`);
    return `<tr><td data-order="${t}">${d}</td>${r}</tr>`;
  });
}

function eod(sym) {
  const j = JSON.parse(read('eod_LUCK.json'));
  j.data = j.data.map(([t, p, v, o]) => [t, +(p * factor(sym, t)).toFixed(2), v, +(o * factor(sym, t)).toFixed(2)]);
  return JSON.stringify(j);
}

function company(sym) {
  const f = factor(sym, T0);
  return read('company_LUCK.html').replace(/LUCK/g, sym).replace(/(<div class="quote__close">\s*Rs\.?)([\d,]+\.\d+)/, (_m, a, v) => `${a}${(Number(v.replace(/,/g, '')) * f).toFixed(2)}`);
}

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const form = Object.fromEntries(new URLSearchParams(body));
    const send = (s, type = 'text/html') => res.writeHead(200, { ...cors, 'Content-Type': type }).end(s);
    const p = u.pathname;
    try {
      if (p === '/indices') return send(read('indices.html'));
      if (p.startsWith('/indices/')) return send(read('index_KSE100.html'));
      if (p.startsWith('/trading-board')) return send(read('board.html'));
      if (p === '/screener') return send(read('screener.html'));
      if (p === '/symbols') return send(read('symbols.json'), 'application/json');
      if (p.startsWith('/timeseries/eod/')) return send(eod(decodeURIComponent(p.split('/').pop())), 'application/json');
      if (p.startsWith('/timeseries/int/')) return send(read(p.endsWith('KMI30') ? 'int_KMI30.json' : p.endsWith('KSE100') ? 'int_KSE100.json' : 'int_LUCK.json'), 'application/json');
      if (p === '/historical') return send(historical(form.symbol || 'LUCK'));
      if (p === '/company/payouts') return send(read('payouts_LUCK.html'));
      if (p.startsWith('/company/')) return send(company(decodeURIComponent(p.split('/').pop())));
    } catch (e) {
      return res.writeHead(500, cors).end(String(e));
    }
    res.writeHead(404, cors).end('not mocked');
  });
});
server.listen(Number(process.argv[2] || 8098), () => console.log('mock PSX on', server.address().port));
