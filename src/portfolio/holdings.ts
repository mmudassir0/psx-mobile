/** Your real holdings, kept on the phone only. */
import { useEffect, useState } from 'react';
import { load, save } from '../storage';
import type { Holding } from './review';

const KEY = 'real.holdings';
let current: Holding[] | null = null;
const listeners = new Set<(h: Holding[]) => void>();

async function ensure(): Promise<Holding[]> {
  if (current) return current;
  current = await load<Holding[]>(KEY, []);
  return current;
}

export async function setHoldings(h: Holding[]) {
  current = [...h].sort((a, b) => a.symbol.localeCompare(b.symbol));
  await save(KEY, current);
  listeners.forEach((f) => f(current!));
}

export function holdingsText(h: Holding[]): string {
  return h.map((x) => `${x.symbol} ${x.shares} ${x.avgCost}`).join('\n');
}

export function useHoldings(): { holdings: Holding[]; loaded: boolean } {
  const [h, setH] = useState<Holding[] | null>(current);
  useEffect(() => {
    let alive = true;
    ensure().then((v) => alive && setH(v));
    const f = (v: Holding[]) => setH(v);
    listeners.add(f);
    return () => {
      alive = false;
      listeners.delete(f);
    };
  }, []);
  return { holdings: h ?? [], loaded: h != null };
}
