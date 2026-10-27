/** An SVG path for a small line chart of `v` in a w×h box (no phone APIs, so the tests can use it). */
export function sparkPath(v: number[], w: number, h: number): string {
  if (v.length < 2) return '';
  const hi = Math.max(...v);
  const lo = Math.min(...v);
  const span = hi - lo || 1;
  return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)} ${(2 + ((hi - x) / span) * (h - 4)).toFixed(1)}`).join('');
}
