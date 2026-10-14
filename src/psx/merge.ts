import type { BoardQuote, ScreenerRow, Stock, SymbolInfo } from './types';

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, '&');
}

export function mergeStocks(symbols: SymbolInfo[], screener: ScreenerRow[], board: BoardQuote[]): Stock[] {
  const info = new Map(symbols.map((s) => [s.symbol, s]));
  const scr = new Map(screener.map((s) => [s.symbol, s]));
  const live = new Map(board.map((b) => [b.symbol, b]));
  const all = new Set<string>([...scr.keys(), ...live.keys()]);
  const out: Stock[] = [];
  for (const symbol of all) {
    const i = info.get(symbol);
    if (i?.isDebt) continue;
    const s = scr.get(symbol);
    const b = live.get(symbol);
    let price = b?.price ?? s?.price ?? null;
    let change = b?.change ?? null;
    let changePct = b?.changePct ?? s?.changePct ?? null;
    let ldcp = b?.ldcp ?? null;
    if (change == null && price != null && changePct != null && changePct > -100) {
      ldcp = Math.round((price / (1 + changePct / 100)) * 100) / 100;
      change = Math.round((price - ldcp) * 100) / 100;
    }
    out.push({
      symbol,
      name: i?.name ?? b?.name ?? symbol,
      sector: i?.sectorName ? titleCase(i.sectorName) : 'Other',
      price,
      change,
      changePct,
      ldcp,
      volume: b?.volume ?? null,
      shariah: s?.shariah ?? false,
      indexes: s?.indexes ?? [],
      marketCap: s?.marketCap ?? null,
      pe: s?.pe ?? null,
      divYield: s?.divYield ?? null,
      change1y: s?.change1y ?? null,
      bid: b?.bid ?? null,
      bidVol: b?.bidVol ?? null,
      ask: b?.ask ?? null,
      askVol: b?.askVol ?? null,
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}
