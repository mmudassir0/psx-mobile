export interface IndexQuote {
  code: string;
  current: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
}

/** One row of the live trading board (main REG board). */
export interface BoardQuote {
  symbol: string;
  name: string;
  ldcp: number | null;
  change: number | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  bid: number | null;
  bidVol: number | null;
  ask: number | null;
  askVol: number | null;
}

/** One row of /screener: fundamentals plus index membership. */
export interface ScreenerRow {
  symbol: string;
  sectorCode: string;
  indexes: string[];
  shariah: boolean;
  marketCap: number | null;
  price: number | null;
  changePct: number | null;
  change1y: number | null;
  pe: number | null;
  divYield: number | null;
  freeFloat: number | null;
  avgVol30: number | null;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  sectorName: string;
  isETF: boolean;
  isDebt: boolean;
}

export interface SeriesPoint {
  /** epoch ms */
  t: number;
  v: number;
  vol: number;
  open?: number;
}

export interface Announcement {
  date: string;
  title: string;
  url: string | null;
  category: string;
}

export interface CompanyInfo {
  symbol: string;
  name: string | null;
  sector: string | null;
  close: number | null;
  change: number | null;
  changePct: number | null;
  asOf: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ldcp: number | null;
  circuitLow: number | null;
  circuitHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  pe: number | null;
  change1y: number | null;
  ytd: number | null;
  marketCap: number | null;
  shares: number | null;
  freeFloatPct: number | null;
  description: string | null;
  announcements: Announcement[];
}

/** Everything the UI needs for one stock, merged from the sources above. */
export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  ldcp: number | null;
  volume: number | null;
  shariah: boolean;
  indexes: string[];
  marketCap: number | null;
  pe: number | null;
  divYield: number | null;
  change1y: number | null;
}
