/**
 * Indicator table for the Technicals tab: each oscillator and moving average
 * with its value and a Buy / Sell / Neutral reading, plus pivot points.
 * Readings follow the conventions most charting sites use, so they can be
 * compared with other apps.
 */
import type { Candle } from '../psx/types';
import { cci, closes, ema, last, macd, rsi, sma, stochastic, williamsR } from './indicators';
import { pivots, Pivots } from './levels';

export type Action = 'Buy' | 'Sell' | 'Neutral';

export interface Reading {
  id: string;
  name: string;
  params: string;
  value: number | null;
  action: Action;
}

export interface Technicals {
  price: number;
  asOf: number;
  oscillators: Reading[];
  averages: Reading[];
  pivots: Pivots | null;
  summary: { buy: number; sell: number; neutral: number; verdict: 'Strong buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong sell' };
}

const band = (v: number | null, buyBelow: number, sellAbove: number): Action =>
  v == null ? 'Neutral' : v < buyBelow ? 'Buy' : v > sellAbove ? 'Sell' : 'Neutral';

export function technicals(candles: Candle[]): Technicals | null {
  const c = candles.filter((b) => b.c > 0);
  if (c.length < 30) return null;
  const cl = closes(c);
  const price = cl[cl.length - 1];

  const r = last(rsi(cl, 14));
  const st = stochastic(c, 14, 3, 3);
  const m = macd(cl);
  const mLine = last(m.macd);
  const mSig = last(m.signal);
  const cc = last(cci(c, 20));
  const wr = last(williamsR(c, 14));

  const oscillators: Reading[] = [
    { id: 'rsi', name: 'RSI', params: '14', value: r, action: band(r, 30, 70) },
    { id: 'stoch', name: 'Stochastic', params: '14, 3, 3', value: last(st.k), action: band(last(st.k), 20, 80) },
    {
      id: 'macd',
      name: 'MACD',
      params: '12, 26, 9',
      value: mLine,
      action: mLine == null || mSig == null ? 'Neutral' : mLine > mSig ? 'Buy' : 'Sell',
    },
    { id: 'cci', name: 'CCI', params: '20', value: cc, action: band(cc, -100, 100) },
    { id: 'wr', name: 'Williams %R', params: '14', value: wr, action: band(wr, -80, -20) },
  ];

  const averages: Reading[] = [];
  for (const n of [5, 10, 20, 50, 100, 200]) {
    for (const kind of ['SMA', 'EMA'] as const) {
      const v = last(kind === 'SMA' ? sma(cl, n) : ema(cl, n));
      averages.push({
        id: `${kind.toLowerCase()}${n}`,
        name: kind,
        params: String(n),
        value: v,
        action: v == null ? 'Neutral' : price > v ? 'Buy' : 'Sell',
      });
    }
  }

  const all = [...oscillators, ...averages];
  const buy = all.filter((x) => x.action === 'Buy').length;
  const sell = all.filter((x) => x.action === 'Sell').length;
  const neutral = all.length - buy - sell;
  const net = (buy - sell) / all.length;
  const verdict = net >= 0.5 ? 'Strong buy' : net >= 0.1 ? 'Buy' : net <= -0.5 ? 'Strong sell' : net <= -0.1 ? 'Sell' : 'Neutral';

  // Floor pivots for the next session come from the last completed daily bar.
  const prev = c[c.length - 1];
  return {
    price,
    asOf: prev.t,
    oscillators,
    averages,
    pivots: pivots(prev),
    summary: { buy, sell, neutral, verdict },
  };
}
