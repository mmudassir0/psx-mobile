/**
 * Builds the compact, plain-text data pack an on-device model reads.
 *
 * Small models have small context windows and get arithmetic wrong, so every
 * number here is already computed by the app, labelled, rounded, and given a
 * reading ("above", "oversold") where one helps. The model's job is to explain
 * and weigh this evidence, never to calculate.
 */
import { Backtest, recordText, trackRecord } from '../analysis/backtest';
import { FairValue, fairText } from '../analysis/fairValue';
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
  /** the technical score tested on this stock's own history, when computed */
  backtest?: Backtest | null;
  /** fair value range, when it could be estimated */
  fair?: FairValue | null;
}

/**
 * `compact` (for on-phone models) keeps what the explanation needs and drops
 * detail the verdict already summarises: per-rule lines, indicator tables,
 * pivots, older results and peers. Roughly halves the prompt, which is most of
 * the wait before a phone model starts writing.
 */
export function stockContext(x: StockPack, compact = false): string {
  const s = x.stock;
  const c = x.company;
  const sym = s?.symbol ?? c?.symbol ?? '?';
  const price = s?.price ?? c?.close ?? null;
  const L: string[] = [];

  L.push(`STOCK ${sym} — ${c?.name ?? s?.name ?? ''} (${s?.sector ?? c?.sector ?? 'sector n/a'})${s?.shariah ? ', Shariah-compliant' : ''}`);
  L.push(`Date ${x.today}. Price Rs ${n(price)}, today ${p(s?.changePct ?? c?.changePct, 2)}, 1-year ${p(c?.change1y)}, YTD ${p(c?.ytd)}.`);
  if (c?.week52Low != null && c?.week52High != null && price != null && c.week52High > c.week52Low) {
    const pos = ((price - c.week52Low) / (c.week52High - c.week52Low)) * 100;
    L.push(`52-week range Rs ${n(c.week52Low)} to ${n(c.week52High)}; price is ${pos.toFixed(0)}% of the way up.`);
  }

  if (x.analysis) {
    const a = x.analysis;
    L.push('');
    L.push(`TECHNICAL SCORE ${a.score.toFixed(1)}/10 (${a.stance}), from daily closes to ${new Date(a.asOf).toISOString().slice(0, 10)}.`);
    if (!compact) for (const rule of a.rules) L.push(`- ${rule.vote > 0 ? 'bullish' : rule.vote < 0 ? 'bearish' : 'neutral'}: ${rule.reason}`);
    L.push(`Liquidity: median daily traded value Rs ${big(a.liquidity)} over 60 sessions${a.liquidity < 5e6 ? ' (thin: chart signals are unreliable on stocks this quiet)' : ''}.`);
    L.push(`Support Rs ${n(a.support?.price)}, resistance Rs ${n(a.resistance?.price)}, volatility stop (close - 2×ATR) Rs ${n(a.stop)}, ATR Rs ${n(a.ind.atr14)}.`);
    const rec = x.backtest ? trackRecord(x.backtest, a.stance) : null;
    if (rec) {
      const t = recordText(rec, sym);
      L.push(`TRACK RECORD (backtest of this same score on ${sym}'s own past prices, no hindsight): ${t.text} ${t.judgement}`);
      if (!compact && x.backtest) {
        const rules = x.backtest.rules
          .filter((r) => r.bull.days >= 40 && r.bear.days >= 40)
          .map((r) => `${r.name} ${(r.bull.avg - r.bear.avg) * 100 >= 0 ? '+' : ''}${((r.bull.avg - r.bear.avg) * 100).toFixed(1)}pts`);
        if (rules.length) L.push(`Each rule's past edge on ${sym} (10-day average when bullish minus when bearish): ${rules.join(', ')}.`);
      }
    }
  }
  if (x.tech && !compact) {
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
          fa.periods.slice(0, compact ? 2 : 4).map((per, i) => `${per}: sales ${big((sales[i] ?? NaN) * 1000)}, profit ${big((profit[i] ?? NaN) * 1000)}, EPS ${n(eps[i])}`).join('; ') +
          '.',
      );
    }
    const fq = c.financialsQuarterly;
    if (fq && !compact) {
      const eps = fq.rows.find((rw) => /^eps$/i.test(rw.label))?.values ?? [];
      L.push(`Quarterly EPS (newest first): ${fq.periods.map((per, i) => `${per} ${n(eps[i])}`).join(', ')}.`);
    }
    if (c.ratios) {
      const g = (re: RegExp) => c.ratios!.rows.find((rw) => re.test(rw.label))?.values[0] ?? null;
      L.push(`Latest year: gross margin ${p(g(/gross/i))}, net margin ${p(g(/net profit/i))}, EPS growth ${p(g(/eps growth/i))}, PEG ${n(g(/^peg/i))}.`);
    }
    const peerPe = median(x.peers.map((q) => q.pe ?? NaN).filter((v) => v > 0));
    const pe = c.pe ?? s?.pe;
    L.push(`Valuation: P/E ${pe != null && pe > 0 ? n(pe) : 'n/a (loss or no earnings)'} (sector median ${n(peerPe)}), dividend yield ${p(s?.divYield)}, market cap ${big(c.marketCap)}.`);
  }
  if (x.fair && price != null) {
    L.push('');
    L.push(compact ? fairText(x.fair, price).split('\n')[0] : fairText(x.fair, price));
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
    .slice(0, compact ? 4 : 6);
  if (news.length) {
    L.push('');
    L.push('RECENT ANNOUNCEMENTS (titles only, newest first):');
    for (const a of news) L.push(`- ${a.date} [${a.category}] ${a.title.length > 100 ? a.title.slice(0, 99) + '…' : a.title}`);
  }

  if (x.peers.length && !compact) {
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

export type Tier = 'small' | 'large';

/**
 * The verdict, levels and lists of points are already on screen (decided in
 * code). The model's job is the part rules can't do: explain how the pieces
 * fit together, in plain words.
 */
const EXPLAIN_SMALL = `You are Sahm, a stock analyst for the Pakistan Stock Exchange.
The app has already decided the verdict and shown it to the user. Your job: explain it in plain, simple English.
Rules:
- Use only facts and numbers that appear in the message. Copy numbers exactly. Do not calculate.
- Do not change the verdict, the confidence or the levels.
- Keep it short. Write exactly these four parts and nothing else:
**Why ${'${call}'}:** 2 or 3 sentences connecting the most important reasons. If there is a Track record line, end with one sentence saying how this signal has done on this stock before.
**What to watch:** 1 or 2 sentences naming the price levels that would change the picture.
**Risks:** 2 short bullet points.
**News:** 1 sentence about the announcement titles, or "Nothing notable."`;

const EXPLAIN_LARGE = `You are Sahm, an experienced equity analyst covering the Pakistan Stock Exchange.
The app has already shown the user a rule-based verdict with levels. Explain it and add judgment rules can't:
how the technical picture and the business results fit together, what the recent announcements likely mean, and what matters most from here.
Rules:
- Use only facts and numbers from the message; copy numbers exactly; never invent prices, events or news.
- Announcement titles are all you know about news; say what a title implies, not what it might contain.
- Plain English, no jargon without a short explanation, no hedging boilerplate.
Write exactly these parts:
**Why ${'${call}'}:** 3 or 4 sentences. If there is a Track record line, say in one sentence how much that history should be trusted.
**What to watch:** 1 or 2 sentences on the levels or results that would change the view.
**Risks:** 2 or 3 bullet points.
**News:** 1 or 2 sentences.
**Second opinion:** only if you would weigh the evidence differently from the rules, say how in one sentence; otherwise write "Agree with the rules."`;

export function analysisMessages(context: string, verdict: string, call: string, tier: Tier = 'small') {
  const system = (tier === 'large' ? EXPLAIN_LARGE : EXPLAIN_SMALL).replace('${call}', call.toLowerCase());
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `${verdict}\n\nDATA\n${context}\n\nExplain the verdict.` },
  ];
}

export const CHAT_SYSTEM = `You are Sahm, an assistant for the Pakistan Stock Exchange inside a stock app.
Answer the question using ONLY the data below the line. Every number there is correct.
- Copy numbers exactly; do not calculate new ones; do not invent prices, news or companies.
- Answer the question directly in the first sentence, then give the 2–4 facts that support it.
- If the data has a RANKING or COMPARISON block, base your answer on it: it is already sorted and correct.
- A FAIR VALUE block is Sahm's own estimate with its working; use it when asked what a stock is worth or whether it is under- or overvalued, give the range rather than one number, and mention its caveats.
- A TRACK RECORD line is a backtest of the technical score on that stock's past prices; quote it when asked whether the signals work.
- "Cheap" or "expensive" means valuation (P/E, price to book), never the share price.
- A '-' means the value is not available; never treat it as zero.
- If the data does not contain the answer, say what is missing in one sentence.
- Keep it short. Mention symbols in capitals. End investment opinions with "Not investment advice."`;
