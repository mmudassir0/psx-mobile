/** The market as text for the AI: index trend, levels, breadth and sectors, all computed by Sahm. */
import type { ChatMessage } from './models';
import { IndexTrend, MarketFeed, SectorStat, sectorRows, trendTriggers } from '../analysis/market';

const f0 = (v: number) => Math.round(v).toLocaleString('en-US');
const pc = (v: number | null | undefined) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const day = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export function marketContext(name: string, t: IndexTrend, opts: { breadth?: number | null; sectors?: SectorStat[]; up?: number; down?: number; compact?: boolean } = {}): string {
  const L: string[] = [];
  const tr = trendTriggers(t);
  L.push(`INDEX ${name}, closes to ${day(t.asOf)}. Level ${f0(t.close)}.`);
  L.push(`TREND (decided by Sahm's rules): ${t.regime}, for ${t.days} trading days since ${day(t.since)}.`);
  L.push(`50-day average ${f0(t.ma50)}, 200-day average ${f0(t.ma200)} (${pc(t.slope200)} over 20 days). 60-day range ${f0(t.rangeLow)} to ${f0(t.rangeHigh)}.`);
  L.push(`Support ${t.support ? f0(t.support) : 'n/a'}, resistance ${t.resistance ? f0(t.resistance) : 'n/a'}. 52-week high ${f0(t.high52)} (now ${pc(t.fromHigh)} from it), low ${f0(t.low52)}.`);
  L.push(`Returns: 1 week ${pc(t.returns.w1)}, 1 month ${pc(t.returns.m1)}, 3 months ${pc(t.returns.m3)}, year to date ${pc(t.returns.ytd)}, 1 year ${pc(t.returns.y1)}.`);
  L.push(`What would change it: ${tr.up} ${tr.down}`);
  if (opts.breadth != null) L.push(`Breadth: ${Math.round(opts.breadth * 100)}% of liquid PSX stocks are above their 200-day average.`);
  if (opts.up != null && opts.down != null) L.push(`Today in this index: ${opts.up} up, ${opts.down} down.`);
  const s = opts.sectors ?? [];
  if (s.length) {
    const row = (x: SectorStat) => `${x.name} ${pc(x.r1m)} in a month (1 week ${pc(x.r1w)}), volume ${x.vol.toFixed(1)}× normal, ${Math.round(x.up * 100)}% of ${x.n} stocks in uptrends`;
    const n = opts.compact ? 3 : 5;
    L.push(`LEADING SECTORS (last month): ${s.slice(0, n).map(row).join('; ')}.`);
    L.push(`LAGGING SECTORS: ${s.slice(-n).reverse().map(row).join('; ')}.`);
  }
  return L.join('\n');
}

const SYSTEM = `You are Sahm, an analyst for the Pakistan Stock Exchange.
The app has already worked out the index trend and the numbers below. Explain them in plain English for an investor.
Rules:
- Use only facts and numbers from the message; copy numbers exactly; never invent news, events or reasons.
- Sector moves come from prices and volume only; you may say what such a move usually means, but don't claim why it happened.
- Do not change the trend the app decided.
Write exactly these parts:
**Where the market stands:** 2 or 3 sentences on the trend, how long it has lasted and what the breadth says.
**Sectors:** 2 sentences on which sectors lead and lag, and whether volume backs the moves.
**What to watch:** 1 or 2 sentences on the levels that would change the picture.
**For a long-term investor:** 1 or 2 sentences on what this means for someone holding for years.`;

export function marketMessages(context: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `DATA\n${context}\n\nExplain the market.` },
  ];
}

const NAMES: Record<string, string> = { KSE100: 'KSE-100', KMI30: 'KMI-30', ALLSHR: 'All Share' };

/** The daily market report as text for Ask Sahm. */
export function marketFeedText(m: MarketFeed, compact = false): string {
  const L: string[] = [];
  const idx = Object.entries(m.indices).map(([c, i]) => `${NAMES[c] ?? c} ${i.regime.toLowerCase()} for ${i.days} trading days since ${day(i.since)} (level ${f0(i.close)}, 1 month ${pc(i.r1m)}, ${pc(i.fromHigh)} from its 52-week high)`);
  L.push(`MARKET TREND at the ${m.day} close (decided by Sahm's rules): ${idx.join('; ')}.`);
  if (m.breadth != null) L.push(`${Math.round(m.breadth * 100)}% of liquid stocks are above their 200-day average.`);
  const s = sectorRows(m);
  const n = compact ? 3 : 5;
  const row = (x: SectorStat) => `${x.name} ${pc(x.r1m)} (1 week ${pc(x.r1w)}, volume ${x.vol.toFixed(1)}×, ${Math.round(x.up * 100)}% in uptrends)`;
  if (s.length) {
    L.push(`SECTORS LEADING over the past month: ${s.slice(0, n).map(row).join('; ')}.`);
    L.push(`SECTORS LAGGING: ${s.slice(-n).reverse().map(row).join('; ')}.`);
  }
  return L.join('\n');
}
