/**
 * Has each company's dividend grown, held or been cut? From cash dividends per
 * share by fiscal year (the last five full years; the current year, still being
 * paid, is left out).
 */

export interface DivGrowth {
  years: { fy: string; dps: number }[];
  /** yearly growth from the first to the last year, e.g. 0.12 */
  cagr: number | null;
  /** years in a row the dividend went up, counted back from the latest */
  streak: number;
  cuts: number;
  verdict: 'growing' | 'steady' | 'cut' | 'irregular' | 'none';
  text: string;
}

/** `latestFy`: the last fiscal year with full-year results (later ones are still being paid). Years without a dividend count as 0. */
export function divGrowth(years: { fy: string; dps: number }[], latestFy: string | null, n = 5): DivGrowth {
  const by = new Map(years.map((y) => [y.fy, y.dps]));
  const last = latestFy ? Number(latestFy) : Math.max(0, ...years.map((y) => Number(y.fy)).filter(Number.isFinite));
  const firstPaid = Math.min(
    ...years
      .filter((y) => y.dps > 0)
      .map((y) => Number(y.fy))
      .filter(Number.isFinite),
  );
  const ys: { fy: string; dps: number }[] = [];
  // oldest first; not before the first year it ever paid in the data
  for (let y = last - n + 1; y <= last; y++) if (y >= firstPaid || ys.length) ys.push({ fy: String(y), dps: by.get(String(y)) ?? 0 });
  const paid = ys.filter((y) => y.dps > 0);
  if (!paid.length || !ys.length) return { years: ys, cagr: null, streak: 0, cuts: 0, verdict: 'none', text: 'No cash dividend in the last five years.' };
  let streak = 0;
  for (let i = ys.length - 1; i > 0 && ys[i].dps > ys[i - 1].dps * 1.001; i--) streak++;
  let cuts = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i].dps < ys[i - 1].dps * 0.9) cuts++;
  const first = ys.find((y) => y.dps > 0)!;
  const lastY = ys[ys.length - 1];
  const span = ys.length - 1 - ys.indexOf(first);
  const cagr = span >= 1 && lastY.dps > 0 ? (lastY.dps / first.dps) ** (1 / span) - 1 : null;
  const gaps = ys.filter((y) => !(y.dps > 0)).length;
  const verdict: DivGrowth['verdict'] = gaps >= 2 ? 'irregular' : lastY.dps < (ys[ys.length - 2]?.dps ?? 0) * 0.9 ? 'cut' : cagr != null && cagr > 0.03 && cuts === 0 ? 'growing' : cuts >= 2 ? 'irregular' : 'steady';
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const text =
    verdict === 'growing'
      ? `Up about ${pct(cagr!)} a year${streak >= 2 ? `, ${streak} rises in a row` : ''}.`
      : verdict === 'cut'
        ? `Cut in the latest year (Rs ${(ys[ys.length - 2]?.dps ?? 0).toFixed(2)} → Rs ${lastY.dps.toFixed(2)}).`
        : verdict === 'irregular'
          ? `Up and down: ${gaps ? `no dividend in ${gaps} of the years` : `${cuts} cuts`}.`
          : `Roughly steady${cagr != null ? ` (${cagr >= 0 ? '+' : ''}${pct(cagr)} a year)` : ''}.`;
  return { years: ys, cagr, streak, cuts, verdict, text };
}
