import { useEffect, useState } from 'react';
import { fetchSeries } from '../psx/api';
import type { SeriesPoint } from '../psx/types';
import { useMarket } from './market';

const REFRESH_MS = 5 * 60_000;
const store: Record<string, { at: number; data: SeriesPoint[] }> = {};

/** Intraday points for a few indices, refreshed at most every 5 minutes. */
export function useIndexSeries(codes: string[]): Record<string, number[]> {
  const { updatedAt } = useMarket();
  const [, bump] = useState(0);
  const key = codes.join(',');

  useEffect(() => {
    let alive = true;
    const stale = codes.filter((c) => !store[c] || Date.now() - store[c].at > REFRESH_MS);
    if (!stale.length) return;
    Promise.all(
      stale.map((c) =>
        fetchSeries('int', c)
          .then((d) => {
            const lastDay = d.length ? Math.floor((d[d.length - 1].t + 5 * 3600_000) / 86_400_000) : 0;
            store[c] = { at: Date.now(), data: d.filter((p) => Math.floor((p.t + 5 * 3600_000) / 86_400_000) === lastDay) };
          })
          .catch(() => {}),
      ),
    ).then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, updatedAt]);

  const out: Record<string, number[]> = {};
  for (const c of codes) {
    const pts = store[c]?.data ?? [];
    // Thin to ~60 points: enough for a sparkline.
    const step = Math.max(1, Math.floor(pts.length / 60));
    out[c] = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => p.v);
  }
  return out;
}
