/**
 * Plain-word explanations for the terms Sahm uses, each with a worked example from
 * one of your own holdings when the numbers are there.
 */
export type TermId =
  | 'pe'
  | 'eps'
  | 'divYield'
  | 'bookClosure'
  | 'fairValue'
  | 'marketCap'
  | 'freeFloat'
  | 'kibor'
  | 'policyRate'
  | 'tbill'
  | 'earningsYield'
  | 'roe'
  | 'ma200'
  | 'kse100'
  | 'kmi'
  | 'peBand'
  | 'purification'
  | 'cgt'
  | 'volume';

/** What an example can use: a holding of yours with its figures. */
export interface ExampleStock {
  symbol: string;
  price: number;
  shares: number;
  pe: number | null;
  divYield: number | null;
  marketCap: number | null;
}

export interface Term {
  title: string;
  body: string;
  example?: (s: ExampleStock) => string | null;
  /** what the example needs, to pick a holding that has it */
  needs?: (s: ExampleStock) => boolean;
}

const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;
const rs2 = (v: number) => `Rs ${v.toFixed(2)}`;
const compact = (v: number) => (v >= 1e9 ? `Rs ${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `Rs ${(v / 1e6).toFixed(0)} million` : rs(v));

export const TERMS: Record<TermId, Term> = {
  pe: {
    title: 'P/E (price to earnings)',
    body: "How many years of today's profit you pay for in the share price. A P/E of 5 means the price is 5 times what the company earned per share over the last year. Lower is cheaper, but a low P/E can also mean the market expects profits to fall.",
    needs: (s) => s.pe != null && s.pe > 0,
    example: (s) => `${s.symbol} trades at ${rs2(s.price)} with a P/E of ${s.pe!.toFixed(1)}: it earned about ${rs2(s.price / s.pe!)} per share last year, so you pay ${s.pe!.toFixed(1)} years of that profit.`,
  },
  eps: {
    title: 'EPS (earnings per share)',
    body: "The company's profit divided by the number of its shares: what each share earned. Price ÷ EPS gives the P/E.",
    needs: (s) => s.pe != null && s.pe > 0,
    example: (s) =>
      `${s.symbol}: ${rs2(s.price)} ÷ P/E ${s.pe!.toFixed(1)} ≈ EPS of ${rs2(s.price / s.pe!)} over the last year. Your ${s.shares.toLocaleString('en-US')} shares earned about ${rs(s.shares * (s.price / s.pe!))} of profit for you.`,
  },
  divYield: {
    title: 'Dividend yield',
    body: "Cash dividends paid over the last year as a percentage of the share price. A 10% yield means Rs 10 a year for every Rs 100 invested at today's price, if the company keeps paying the same. Tax is taken before it reaches you.",
    needs: (s) => s.divYield != null && s.divYield > 0,
    example: (s) => `${s.symbol} yields ${s.divYield!.toFixed(1)}%. On your holding worth ${rs(s.price * s.shares)}, that is about ${rs((s.price * s.shares * s.divYield!) / 100)} a year before tax.`,
  },
  bookClosure: {
    title: 'Book closure',
    body: "The days the company closes its register of shareholders to decide who gets the dividend. Your shares must be on the register the day before it starts. PSX settles a trade the next working day (T+1), so buy at least two working days before the first book-closure day. Selling after the register closes doesn't lose you the dividend.",
  },
  fairValue: {
    title: 'Fair value',
    body: "Sahm's estimate of what a share is worth, from how its similar companies are priced (their P/E and price to book) and its own dividend. It's a rough guide with a range, not a target: when the price is well below it the share looks cheap on these measures.",
  },
  marketCap: {
    title: 'Market cap',
    body: 'Share price × every share the company has: what the whole company is worth on the market.',
    needs: (s) => s.marketCap != null && s.marketCap > 0,
    example: (s) => `${s.symbol} is worth ${compact(s.marketCap!)}. Your ${s.shares.toLocaleString('en-US')} shares own ${((s.price * s.shares * 100) / s.marketCap!).toPrecision(2)}% of it.`,
  },
  freeFloat: {
    title: 'Free float',
    body: 'The share of a company that actually trades, after the founders, government and other long-term owners. A small free float means fewer shares change hands, so prices can jump more.',
  },
  kibor: {
    title: 'KIBOR',
    body: 'Karachi Interbank Offered Rate: what banks charge each other to lend. Most business loans in Pakistan are priced at KIBOR plus a margin, so when it falls, companies with big loans pay less interest and keep more profit.',
  },
  policyRate: {
    title: 'Policy rate',
    body: "The State Bank's main interest rate, set about every six weeks. It moves KIBOR, bank deposit rates and T-bill returns. Cuts usually help shares; banks' earnings slip a little.",
  },
  tbill: {
    title: 'T-bills',
    body: 'Short government loans (3, 6 or 12 months) sold at auction. Their return is the "safe" rate shares have to beat to be worth the extra risk.',
  },
  earningsYield: {
    title: 'Earnings yield',
    body: 'Profit as a percentage of price: 1 ÷ P/E. A P/E of 5 is an earnings yield of 20%. It lets you compare shares with T-bills and savings rates directly.',
    needs: (s) => s.pe != null && s.pe > 0,
    example: (s) => `${s.symbol}'s P/E of ${s.pe!.toFixed(1)} is an earnings yield of ${(100 / s.pe!).toFixed(1)}%: for every Rs 100 of its price, it earned Rs ${(100 / s.pe!).toFixed(1)} last year.`,
  },
  roe: {
    title: 'ROE (return on equity)',
    body: "Yearly profit as a percentage of the shareholders' money in the business. 20% means it earns Rs 20 a year on each Rs 100 the owners have in it. Steady high ROE is a sign of a good business; very high ROE with a lot of debt is less comfortable.",
  },
  ma200: {
    title: '200-day average',
    body: 'The average closing price over the last 200 trading days (about ten months). A price above it is usually called an uptrend, below it a downtrend. It shows the direction so far, not where it goes next.',
  },
  kse100: {
    title: 'KSE-100',
    body: 'PSX\'s main index: the 100 biggest companies, weighted by their tradable value. When people say "the market was up 1%" they mean this.',
  },
  kmi: {
    title: 'KMI-30 and KMI All Share',
    body: 'Indexes of Shariah-compliant companies. KMI All Share lists every company that passes the screening; KMI-30 is its 30 biggest. The list is reviewed twice a year.',
  },
  peBand: {
    title: 'P/E against its own history',
    body: "A share's P/E each week over the last years, with its usual range shaded (the middle half of those weeks). If today's P/E is near the bottom of its own range the market is paying less than usual for each rupee of its profit, which can be a chance or a warning that profits are expected to fall.",
  },
  purification: {
    title: 'Dividend purification',
    body: 'Shariah-compliant companies can still earn a little interest (up to 5% of revenue), so the matching part of their dividend is given to charity. The percentage differs by company and is published by Shariah funds and scholars.',
  },
  cgt: {
    title: 'Capital gains tax',
    body: 'Tax on the profit when you sell shares for more than you paid. On PSX the broker and NCCPL take it automatically; the rate depends on whether you file returns and when you bought. Losses in the same tax year are set off against gains.',
  },
  volume: {
    title: 'Volume',
    body: 'How many shares changed hands today. A big rise or fall on much higher volume than usual is a stronger signal than the same move on a quiet day.',
  },
};

/** Your biggest holding that has what the term's example needs. */
export function pickExample(term: Term, holdings: ExampleStock[]): string | null {
  if (!term.example) return null;
  const ok = holdings.filter((h) => h.price > 0 && h.shares > 0 && (!term.needs || term.needs(h))).sort((a, b) => b.price * b.shares - a.price * a.shares);
  return ok.length ? term.example(ok[0]) : null;
}
