/**
 * Builds the compact, plain-text data pack an on-device model reads.
 *
 * Small models have small context windows and get arithmetic wrong, so every
 * number here is already computed by the app, labelled, rounded, and given a
 * reading ("above", "oversold") where one helps. The model's job is to explain
 * and weigh this evidence, never to calculate.
 */
import type { CompanyInfo, Stock } from '../psx/types';
import type { Analysis } from '../analysis/signals';
import type { Technicals } from '../analysis/technicals';
import type { BalanceSheet, Ratios } from '../analysis/ratios';

const n = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const p = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : `${v.toFixed(d)}%`);
const r = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);
function big(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e9) return `Rs ${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `Rs ${(v / 1e6).toFixed(1)}M`;
  return `Rs ${v.toFixed(0)}`;
}

export function median(xs: number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface StockPack {
  stock?: Stock;
  company: CompanyInfo | null;
  analysis: Analysis | null;
  tech: Technicals | null;
  ratios: Ratios | null;
  balance: BalanceSheet | null;
  peers: Stock[];
  today: string; // YYYY-MM-DD
}

export function stockContext(x: StockPack): string {
  const s = x.stock;
  const c = x.company;
  const sym = s?.symbol ?? c?.symbol ?? '?';
  const price = s?.price ?? c?.close ?? null;
  const L: string[] = [];

  L.push(`STOCK ${sym} — ${c?.name ?? s?.name ?? ''} (${s?.sector ?? c?.sector ?? 'sector n/a'})${s?.shariah ? ', Shariah-compliant' : ''}`);
  L.push(`Date ${x.today}. Price Rs ${n(price)}, today ${p(s?.changePct ?? c?.changePct, 2)}, 1-year ${p(c?.change1y)}, YTD ${p(c?.ytd)}.`);
  if (c?.week52Low != null && c?.week52High != null && price != null) {
    const pos = ((price - c.week52Low) / (c.week52High - c.week52Low)) * 100;
    L.push(`52-week range Rs ${n(c.week52Low)} to ${n(c.week52High)}; price is ${pos.toFixed(0)}% of the way up.`);
  }

  if (x.analysis) {
    const a = x.analysis;
    L.push('');
    L.push(`TECHNICAL SCORE ${a.score.toFixed(1)}/10 (${a.stance}), from daily closes to ${new Date(a.asOf).toISOString().slice(0, 10)}.`);
    for (const rule of a.rules) L.push(`- ${rule.vote > 0 ? 'bullish' : rule.vote < 0 ? 'bearish' : 'neutral'}: ${rule.reason}`);
    L.push(`Support Rs ${n(a.support?.price)}, resistance Rs ${n(a.resistance?.price)}, volatility stop (close - 2×ATR) Rs ${n(a.stop)}, ATR Rs ${n(a.ind.atr14)}.`);
  }
  if (x.tech) {
    const t = x.tech;
    L.push(
      `Indicator summary: ${t.summary.buy} buy, ${t.summary.neutral} neutral, ${t.summary.sell} sell → ${t.summary.verdict}. ` +
        t.oscillators.map((o) => `${o.name} ${n(o.value, 1)} (${o.action})`).join(', ') +
        '.',
    );
    const ma = t.averages.filter((a) => a.name === 'SMA').map((a) => `SMA${a.params} ${n(a.value)} (${a.action})`);
    L.push(`Moving averages: ${ma.join(', ')}.`);
    if (t.pivots) L.push(`Pivots next session: S2 ${n(t.pivots.s2)}, S1 ${n(t.pivots.s1)}, PP ${n(t.pivots.pp)}, R1 ${n(t.pivots.r1)}, R2 ${n(t.pivots.r2)}.`);
  }

  if (c) {
    L.push('');
    const fa = c.financialsAnnual;
    if (fa) {
      const row = (re: RegExp) => fa.rows.find((rw) => re.test(rw.label))?.values ?? [];
      const sales = row(/^sales/i);
      const profit = row(/profit after/i);
      const eps = row(/^eps$/i);
      L.push(
        `ANNUAL RESULTS (fiscal year ends ${c.fiscalYearEnd ?? 'n/a'}; newest first): ` +
          fa.periods.map((per, i) => `${per}: sales ${big((sales[i] ?? NaN) * 1000)}, profit ${big((profit[i] ?? NaN) * 1000)}, EPS ${n(eps[i])}`).join('; ') +
          '.',
      );
    }
    const fq = c.financialsQuarterly;
    if (fq) {
      const eps = fq.rows.find((rw) => /^eps$/i.test(rw.label))?.values ?? [];
      L.push(`Quarterly EPS (newest first): ${fq.periods.map((per, i) => `${per} ${n(eps[i])}`).join(', ')}.`);
    }
    if (c.ratios) {
      const g = (re: RegExp) => c.ratios!.rows.find((rw) => re.test(rw.label))?.values[0] ?? null;
      L.push(`Latest year: gross margin ${p(g(/gross/i))}, net margin ${p(g(/net profit/i))}, EPS growth ${p(g(/eps growth/i))}, PEG ${n(g(/^peg/i))}.`);
    }
    const peerPe = median(x.peers.map((q) => q.pe ?? NaN).filter((v) => v > 0));
    L.push(`Valuation: P/E ${n(c.pe ?? s?.pe)} (sector median ${n(peerPe)}), dividend yield ${p(s?.divYield)}, market cap ${big(c.marketCap)}.`);
  }
  if (x.ratios) {
    const q = x.ratios;
    const line = [`P/B ${n(q.priceToBook)}`, `P/S ${n(q.priceToSales)}`, `payout ${r(q.payoutRatio, 0)}`];
    if (x.balance) {
      line.unshift(`ROE ${r(q.roe)}`, `ROA ${r(q.roa)}`);
      if (!x.balance.isBank) line.push(`current ratio ${n(q.currentRatio)}`);
      line.push(`debt/equity ${r(q.debtToEquity, 0)}`, `equity/assets ${r(q.equityToAssets, 0)}`);
      L.push(`Balance sheet as at ${x.balance.periodEnd ?? 'n/a'}: ${line.join(', ')}.`);
    } else {
      L.push(`Ratios: ${line.join(', ')}. (No balance sheet available, so no ROE or debt ratios.)`);
    }
  }

  // Collapse repeated filings (e.g. several director-interest disclosures) into one line each.
  const seen = new Set<string>();
  const news = (c?.announcements ?? [])
    .filter((a) => {
      const k = a.title.toLowerCase().slice(0, 40);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
  if (news.length) {
    L.push('');
    L.push('RECENT ANNOUNCEMENTS (titles only, newest first):');
    for (const a of news) L.push(`- ${a.date} [${a.category}] ${a.title.length > 100 ? a.title.slice(0, 99) + '…' : a.title}`);
  }

  if (x.peers.length) {
    L.push('');
    L.push(
      'PEERS (largest first): ' +
        x.peers
          .slice(0, 5)
          .map((q) => `${q.symbol} ${p(q.changePct, 1)} today, P/E ${q.pe != null && q.pe > 0 ? n(q.pe, 1) : 'n/a'}`)
          .join('; ') +
        '.',
    );
  }
  return L.join('\n');
}

export const ANALYST_SYSTEM = `You are Sahm, a careful equity analyst for the Pakistan Stock Exchange.
You are given a data pack about one stock. Every number in it was computed by the app and is correct.
Rules:
- Use ONLY numbers that appear in the data pack. Never calculate new numbers and never invent facts, news or prices.
- If the data is mixed, say so. Weigh technicals (short term) and fundamentals (long term) separately.
- Announcement titles are all you know about news; don't guess what they contain.
- Be concise and plain. No disclaimers beyond one short line at the end.
Answer in exactly this format:
**Verdict:** Bullish, Neutral or Bearish — confidence Low, Medium or High
**Short term (technicals):** 2–3 sentences.
**Long term (fundamentals):** 2–3 sentences.
**Levels:** entry zone, stop-loss and first target, each taken from the support, resistance, pivots or stop in the data.
**Risks:** 2–3 bullet points.
**News:** one sentence on what the recent announcements suggest, or "Nothing notable."
_Not investment advice._`;

export function analysisMessages(context: string) {
  return [
    { role: 'system' as const, content: ANALYST_SYSTEM },
    { role: 'user' as const, content: `${context}\n\nWrite the analysis.` },
  ];
}

export const CHAT_SYSTEM = `You are Sahm, an assistant for the Pakistan Stock Exchange inside a stock app.
Answer using ONLY the data below the line. Every number there is correct; do not calculate new numbers and do not invent prices, news or companies.
If the data does not contain the answer, say what is missing in one sentence.
Keep answers short: a few sentences or a short list. Mention symbols in capitals. End investment opinions with "Not investment advice."`;
