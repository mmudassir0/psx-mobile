/**
 * Fair value: what the shares would be worth on four standard yardsticks,
 * shown as a range with the working, never as one precise number.
 *
 *  1. Sector P/E   — trailing EPS × the median P/E of the stock's sector peers.
 *  2. Own past P/E — trailing EPS × the median P/E the stock itself traded at
 *                    over its last few fiscal years.
 *  3. Sector P/B   — book value per share × the median price-to-book of peers
 *                    whose balance sheets Sahm has (the main yardstick for banks).
 *  4. Justified P/B — book value × (ROE − g) / (r − g): what a business earning
 *                    ROE on its equity is worth to an investor who needs a return r.
 *
 * Everything is computed here; the AI only explains it.
 */
import type { Candle, FinTable } from '../psx/types';

/**
 * Required return on Pakistani equities: the 10-year PIB yield (12.30% at the
 * 5 Aug 2026 auction; SBP policy rate 11.5%) plus a 6% equity risk premium.
 * Update when rates move a lot.
 */
export const RISK_FREE = 0.123;
export const EQUITY_PREMIUM = 0.06;
export const REQUIRED_RETURN = RISK_FREE + EQUITY_PREMIUM;
/** Long-run growth in rupee profits (roughly inflation plus a little real growth). */
export const LONG_GROWTH = 0.07;
export const RATES_AS_OF = 'August 2026';

/** Sectors whose earnings swing with the economic or commodity cycle: P/E looks cheapest near the peak. */
const CYCLICAL = [
  'cement',
  'automobile assembler',
  'automobile parts',
  'engineering',
  'chemical',
  'refinery',
  'oil & gas exploration',
  'textile',
  'sugar',
  'glass',
  'paper',
  'synthetic',
];
export const isCyclical = (sector: string | null | undefined) => !!sector && CYCLICAL.some((k) => sector.toLowerCase().includes(k));

export interface PeerValuation {
  symbol: string;
  pe: number | null;
  /** price to book, when the peer's balance sheet is known */
  pb: number | null;
}

export interface FairInput {
  symbol: string;
  price: number;
  /** trailing P/E from PSX */
  pe: number | null;
  shares: number | null;
  sector: string | null;
  annual: FinTable | null;
  fiscalYearEnd: string | null;
  bookValuePerShare: number | null;
  roe: number | null;
  isBank: boolean;
  peers: PeerValuation[];
  /** daily candles, adjusted for splits, for the stock's own past P/E */
  daily?: Candle[];
}

export type MethodId = 'peerPE' | 'ownPE' | 'peerPB' | 'justifiedPB';

export interface Method {
  id: MethodId;
  name: string;
  value: number;
  /** one line of working, with the numbers used */
  how: string;
}

export type FairLabel = 'Undervalued' | 'Fairly valued' | 'Overvalued';

export interface FairValue {
  methods: Method[];
  /** median of the methods */
  mid: number;
  low: number;
  high: number;
  /** mid ÷ price − 1 */
  upside: number;
  /** null when only one method could be used */
  label: FairLabel | null;
  /** reasons to trust the range less */
  flags: string[];
  epsTtm: number | null;
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
export function median(xs: number[]): number | null {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const rs = (v: number) => `Rs ${v >= 100 ? v.toFixed(0) : v.toFixed(2)}`;
const x1 = (v: number) => `${v.toFixed(1)}×`;
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Peers count for a multiple only inside sane bounds (no losses, no extreme one-offs). */
const PE_MAX = 60;
const PB_MAX = 15;
export const MIN_PEERS = 3;
/** Above or below the midpoint by more than this is called under- or overvalued. */
export const BAND = 0.15;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Last month (0-11) of the fiscal year, from PSX's text such as "June" or "30 June". Defaults to December. */
export function fiscalEndMonth(text: string | null | undefined): number {
  const t = (text ?? '').toLowerCase();
  const i = MONTHS.findIndex((m) => t.includes(m));
  return i >= 0 ? i : 11;
}

/**
 * The P/E the stock traded at in each past fiscal year: average close over the
 * year ÷ that year's EPS. EPS is recomputed as profit ÷ today's shares, because
 * PSX does not restate old EPS after bonus issues and splits while prices are
 * adjusted.
 */
export function pastPEs(annual: FinTable | null, shares: number | null, fiscalYearEnd: string | null, daily: Candle[]): { year: string; pe: number }[] {
  if (!annual || !ok(shares) || shares <= 0 || !daily.length) return [];
  const profit = annual.rows.find((r) => /profit after/i.test(r.label))?.values ?? [];
  const endMonth = fiscalEndMonth(fiscalYearEnd);
  const out: { year: string; pe: number }[] = [];
  annual.periods.forEach((label, i) => {
    const y = Number(label.match(/\d{4}/)?.[0]);
    const p = profit[i];
    if (!y || !ok(p) || p <= 0) return;
    const end = Date.UTC(y, endMonth + 1, 1); // first day after the fiscal year
    const start = Date.UTC(y - 1, endMonth + 1, 1);
    const closes = daily.filter((b) => b.t >= start && b.t < end && b.c > 0).map((b) => b.c);
    if (closes.length < 120) return; // need most of the year
    const eps = (p * 1000) / shares;
    const pe = closes.reduce((a, b) => a + b, 0) / closes.length / eps;
    if (pe > 0 && pe <= PE_MAX) out.push({ year: label, pe });
  });
  return out;
}

export function fairValue(x: FairInput): FairValue | null {
  if (!ok(x.price) || x.price <= 0) return null;
  const methods: Method[] = [];
  const flags: string[] = [];
  const epsTtm = ok(x.pe) && x.pe > 0 ? x.price / x.pe : null;

  // 1. Sector P/E
  const peerPEs = x.peers.map((p) => p.pe).filter((v): v is number => ok(v) && v > 0 && v <= PE_MAX);
  const sectorPE = peerPEs.length >= MIN_PEERS ? median(peerPEs) : null;
  if (epsTtm && sectorPE) {
    methods.push({
      id: 'peerPE',
      name: 'Sector P/E',
      value: epsTtm * sectorPE,
      how: `EPS ${rs(epsTtm)} (last 12 months) × sector median P/E ${x1(sectorPE)} from ${peerPEs.length} peers`,
    });
  }

  // 2. Own past P/E
  const past = x.daily ? pastPEs(x.annual, x.shares, x.fiscalYearEnd, x.daily) : [];
  const ownPE = past.length >= 2 ? median(past.map((p) => p.pe)) : null;
  if (epsTtm && ownPE) {
    methods.push({
      id: 'ownPE',
      name: 'Own past P/E',
      value: epsTtm * ownPE,
      how: `EPS ${rs(epsTtm)} × its median P/E of ${x1(ownPE)} over fiscal years ${past.map((p) => p.year).reverse().join(', ')}`,
    });
  }

  // 3. Sector P/B
  const bv = x.bookValuePerShare;
  const peerPBs = x.peers.map((p) => p.pb).filter((v): v is number => ok(v) && v > 0 && v <= PB_MAX);
  const sectorPB = peerPBs.length >= MIN_PEERS ? median(peerPBs) : null;
  if (ok(bv) && bv > 0 && sectorPB) {
    methods.push({
      id: 'peerPB',
      name: 'Sector P/B',
      value: bv * sectorPB,
      how: `Book value ${rs(bv)} a share × sector median P/B ${x1(sectorPB)} from ${peerPBs.length} peers`,
    });
  }

  // 4. Justified P/B
  const r = REQUIRED_RETURN;
  const g = LONG_GROWTH;
  if (ok(bv) && bv > 0 && ok(x.roe)) {
    const roe = Math.min(x.roe, 0.35); // very high returns rarely last; cap what we pay for
    // Within two points of growth, the formula gives near-zero values that mean nothing.
    if (roe > g + 0.02) {
      const mult = (roe - g) / (r - g);
      methods.push({
        id: 'justifiedPB',
        name: 'Return on equity',
        value: bv * mult,
        how: `Book value ${rs(bv)} × (ROE ${pc(roe)} − growth ${pc(g)}) ÷ (required return ${pc(r)} − growth ${pc(g)}) = ${x1(mult)} book`,
      });
    } else {
      flags.push(`Return on equity (${pc(x.roe)}) is below long-run growth, so the business is not earning its cost of capital.`);
    }
  }

  if (!methods.length) return null;

  // Reasons to trust the range less.
  if (!epsTtm) flags.push('The company has no trailing profit, so only book-value methods apply.');
  if (isCyclical(x.sector) && epsTtm) flags.push('Cyclical sector: earnings swing with the cycle, so P/E values look highest near a peak.');
  const profit = x.annual?.rows.find((r) => /profit after/i.test(r.label))?.values ?? [];
  if (ok(profit[0]) && ok(profit[1]) && profit[1] > 0 && profit[0] / profit[1] > 1.6) {
    flags.push(`Profit rose ${(((profit[0] / profit[1]) - 1) * 100).toFixed(0)}% last year; if some of it was one-off, the P/E values are too high.`);
  }
  if (x.isBank && !methods.some((m) => m.id === 'peerPB' || m.id === 'justifiedPB')) flags.push('Banks are valued mainly on book value, which is not available here.');

  const values = methods.map((m) => m.value);
  const mid = median(values)!;
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (methods.length >= 2 && high > 2 * low) flags.push('The methods disagree a lot, so treat the range as rough.');
  const upside = mid / x.price - 1;
  const label: FairLabel | null = methods.length < 2 ? null : x.price < mid * (1 - BAND) ? 'Undervalued' : x.price > mid * (1 + BAND) ? 'Overvalued' : 'Fairly valued';
  return { methods, mid, low, high, upside, label, flags, epsTtm };
}

/** Fair value as text for the AI. */
export function fairText(f: FairValue, price: number): string {
  const L = [
    `FAIR VALUE (computed by Sahm, already shown to the user): Rs ${f.low.toFixed(2)} to ${f.high.toFixed(2)}, midpoint Rs ${f.mid.toFixed(2)} vs price Rs ${price.toFixed(2)} (${f.upside >= 0 ? '+' : ''}${(f.upside * 100).toFixed(1)}%)${f.label ? ` → ${f.label}` : ' (one method only, rough)'}.`,
    ...f.methods.map((m) => `- ${m.name}: Rs ${m.value.toFixed(2)} = ${m.how}.`),
  ];
  if (f.flags.length) L.push('Caveats: ' + f.flags.join(' '));
  L.push(`Required return ${(REQUIRED_RETURN * 100).toFixed(1)}% = 10-year PIB ${(RISK_FREE * 100).toFixed(1)}% (${RATES_AS_OF}) + ${(EQUITY_PREMIUM * 100).toFixed(0)}% equity premium.`);
  return L.join('\n');
}
