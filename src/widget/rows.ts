/** Rows that fit: about one per 26dp after the header. */
export const rowsFor = (heightDp: number | undefined, min = 2, max = 8) => Math.max(min, Math.min(max, Math.floor(((heightDp ?? 160) - 48) / 26)));
