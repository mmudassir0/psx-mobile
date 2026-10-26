/**
 * Squarified treemap (Bruls, Huizing & van Wijk): splits a rectangle into
 * tiles with areas in proportion to the values, keeping them as close to
 * square as it can so small tiles stay readable.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile<T> extends Rect {
  item: T;
}

function worst(row: number[], side: number): number {
  const s = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

/** Lays `items` (with value > 0) into `rect`, largest first. */
export function squarify<T>(items: T[], value: (t: T) => number, rect: Rect): Tile<T>[] {
  const list = items.filter((t) => value(t) > 0).sort((a, b) => value(b) - value(a));
  const total = list.reduce((a, t) => a + value(t), 0);
  if (!list.length || total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = list.map((t) => value(t) * scale);
  const out: Tile<T>[] = [];
  let { x, y, w, h } = rect;
  let i = 0;
  while (i < list.length) {
    const side = Math.min(w, h);
    const row: number[] = [areas[i]];
    let j = i + 1;
    while (j < list.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // a column on the left
      const cw = sum / h;
      let cy = y;
      for (let k = 0; k < row.length; k++) {
        const th = row[k] / cw;
        out.push({ item: list[i + k], x, y: cy, w: cw, h: th });
        cy += th;
      }
      x += cw;
      w -= cw;
    } else {
      // a row along the top
      const rh = sum / w;
      let cx = x;
      for (let k = 0; k < row.length; k++) {
        const tw = row[k] / rh;
        out.push({ item: list[i + k], x: cx, y, w: tw, h: rh });
        cx += tw;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/** Two levels: groups (e.g. sectors) sized by their total, then the items inside each. */
export function nested<T>(items: T[], group: (t: T) => string, value: (t: T) => number, rect: Rect, header = 0): { group: string; rect: Rect; labelled: boolean; tiles: Tile<T>[] }[] {
  const groups = new Map<string, T[]>();
  for (const t of items) if (value(t) > 0) groups.set(group(t), [...(groups.get(group(t)) ?? []), t]);
  const outer = squarify([...groups.entries()], ([, ts]) => ts.reduce((a, t) => a + value(t), 0), rect);
  return outer.map((g) => {
    // a label strip only where the group is big enough to spare it
    const top = g.h > header * 3 && g.w > 56 ? header : 0;
    const inner: Rect = { x: g.x, y: g.y + top, w: g.w, h: g.h - top };
    return { group: g.item[0], rect: { x: g.x, y: g.y, w: g.w, h: g.h }, labelled: top > 0, tiles: squarify(g.item[1], value, inner) };
  });
}
