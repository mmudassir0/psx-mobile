/**
 * Builds the daily picks feed: chooses today's picks, checks the market, and
 * scores earlier picks as they play out. Pure: the daily job (scripts/daily-picks.ts)
 * supplies the price series, the app only displays the result.
 */
import type { Candle } from '../psx/types';
import { computeSeries, rulesAt, SeriesSet } from '../analysis/signals';
import { levelsAt, Levels, liquidityAt, MIN_LIQUIDITY, Outcome, playOut, Result, setupsAt, SetupId, SETUP_NAMES, WAIT_DAYS } from '../analysis/picks';

/**
 * The published rules: the wider swing version from the backtest (stop two ATR
 * under the zone, targets 1R and 3R, up to 20 trading days), only the two
 * setups that did best, and only when most liquid stocks are in uptrends.
 */
export const RULES = {
  levels: { zone: 0.5, stop: 2, tp1: 1, tp2: 3 },
  hold: 20,
  setups: ['momentum', 'pullback'] as SetupId[],
  max: 5,
  minBreadth: 0.5,
};

/** Backtest of exactly these rules on liquid PSX stocks (docs/backtest.md), per trade after 0.3% costs. */
export const TESTED: Record<'momentum' | 'pullback', { p1: { won: number; avg: number }; p2: { won: number; avg: number } }> = {
  momentum: { p1: { won: 0.485, avg: -0.0064 }, p2: { won: 0.537, avg: 0.0038 } },
  pullback: { p1: { won: 0.459, avg: -0.0102 }, p2: { won: 0.518, avg: 0.0023 } },
};
export const TESTED_PERIODS = { p1: '2017–21', p2: '2022–26' };

export interface Pick {
  symbol: string;
  setup: SetupId;
  /** the trading day the pick is based on, YYYY-MM-DD (Pakistan) */
  day: string;
  close: number;
  levels: Levels;
  score: number;
  /** median daily traded value, Rs */
  liquidity: number;
  /** made when most stocks were in downtrends: shown to watch, not as a pick */
  weak?: boolean;
}

export interface ScoredPick extends Pick {
  result: Result;
  ret: number | null;
  closedDay: string | null;
}

export interface Stats {
  picks: number;
  bought: number;
  won: number;
  avgRet: number | null;
}

export interface PicksFeed {
  v: 1;
  /** day of the closing prices used */
  day: string;
  generatedAt: string;
  /** share of liquid stocks above their 200-day average */
  breadth: number | null;
  marketOk: boolean;
  picks: Pick[];
  /** earlier picks still in play */
  open: ScoredPick[];
  /** latest finished picks */
  recent: ScoredPick[];
  /** finished picks in the last 90 days, made in strong and in weak markets */
  stats: Stats;
  weakStats: Stats;
  rules: { hold: number; wait: number };
}

export const pkDay = (t: number) => new Date(t + 5 * 3600_000).toISOString().slice(0, 10);

export interface Universe {
  symbol: string;
  candles: Candle[];
  series?: SeriesSet;
}

/** Share of liquid stocks closing above their 200-day average on their last bar. */
export function breadthOf(stocks: Universe[], day: string): number | null {
  let up = 0;
  let n = 0;
  for (const s of stocks) {
    const S = s.series ?? computeSeries(s.candles);
    const i = S.c.length - 1;
    if (i < 0 || pkDay(S.c[i].t) !== day || S.e200[i] == null || liquidityAt(S, i) < MIN_LIQUIDITY) continue;
    n++;
    if (S.cl[i] > (S.e200[i] as number)) up++;
  }
  return n >= 20 ? up / n : null;
}

/** Today's picks from the latest bar of each stock, strongest technical score first, one per stock. */
export function choosePicks(stocks: Universe[], day: string): Pick[] {
  const out: Pick[] = [];
  for (const s of stocks) {
    const S = s.series ?? computeSeries(s.candles);
    const i = S.c.length - 1;
    if (i < 200 || pkDay(S.c[i].t) !== day || !S.c[i].v) continue;
    const liquidity = liquidityAt(S, i);
    if (liquidity < MIN_LIQUIDITY) continue;
    const found = setupsAt(S, i).filter((x) => RULES.setups.includes(x.id));
    if (!found.length) continue;
    const levels = levelsAt(S, i, RULES.levels);
    if (!levels) continue;
    // A pullback gives the better buy zone, so it names the pick when both are present.
    const setup = found.some((x) => x.id === 'pullback') ? 'pullback' : found[0].id;
    out.push({ symbol: s.symbol, setup, day, close: S.cl[i], levels, score: rulesAt(S, i).score, liquidity });
  }
  return out.sort((a, b) => b.score - a.score || b.liquidity - a.liquidity).slice(0, RULES.max);
}

/** Plays a pick forward through the bars after its day. */
export function scorePick(p: Pick, candles: Candle[]): ScoredPick {
  const after = candles.filter((b) => pkDay(b.t) > p.day);
  const o: Outcome = playOut(after, p.levels, WAIT_DAYS, RULES.hold);
  return { ...p, result: o.result, ret: o.ret, closedDay: o.closedAt != null ? pkDay(o.closedAt) : o.result === 'no-fill' ? pkDay(after[WAIT_DAYS - 1].t) : null };
}

export function statsOf(done: ScoredPick[], sinceDay: string, weak = false): Stats {
  const xs = done.filter((p) => p.result !== 'open' && !!p.weak === weak && (p.closedDay ?? p.day) >= sinceDay);
  const bought = xs.filter((p) => p.ret != null);
  return {
    picks: xs.length,
    bought: bought.length,
    won: bought.filter((p) => (p.ret as number) > 0).length,
    avgRet: bought.length ? bought.reduce((a, p) => a + (p.ret as number), 0) / bought.length : null,
  };
}

/** The message as WhatsApp groups format it, plus the tested record, for sharing. */
export function pickText(p: Pick): string {
  const L = p.levels;
  const f = (v: number) => v.toFixed(2);
  const t = TESTED[p.setup as 'momentum' | 'pullback'];
  return [
    `*${p.symbol}* (${SETUP_NAMES[p.setup]})${p.weak ? ' — watch only, weak market' : ''}`,
    `Close: Rs ${f(p.close)}`,
    `🟢 Buy zone: Rs ${f(L.entryLow)} – ${f(L.entryHigh)}`,
    `🎯 TP1: Rs ${f(L.tp1)}`,
    `🎯 TP2: Rs ${f(L.tp2)}`,
    `🛑 SL: Rs ${f(L.stop)}`,
    `Swing, up to ${RULES.hold} trading days. Sahm score ${p.score.toFixed(1)}/10.`,
    t ? `Tested: won ${(t.p2.won * 100).toFixed(0)}% of trades in ${TESTED_PERIODS.p2} (avg ${(t.p2.avg * 100).toFixed(1)}%), ${(t.p1.won * 100).toFixed(0)}% in ${TESTED_PERIODS.p1} (avg ${(t.p1.avg * 100).toFixed(1)}%). Not advice.` : 'Not advice.',
  ].join('\n');
}
