/** One short tip a day on Home, each pointing at the lesson that explains it. */
import { LESSONS } from './lessons';

export interface Tip {
  text: string;
  /** lesson id */
  lesson: string;
}

export const TIPS: Tip[] = [
  { text: 'Over a day a share price is mostly noise; over years it follows the profits.', lesson: 'share' },
  { text: 'Your shares sit in your own CDC account, not with the broker.', lesson: 'account' },
  { text: 'Keep the IBAN on your CDC record right: dividends can only go to that account.', lesson: 'account' },
  { text: 'Being a filer halves the tax on dividends. Check your status in Settings.', lesson: 'account' },
  { text: 'A limit order never fills above your price; a market order takes what is on offer.', lesson: 'orders' },
  { text: 'PSX settles trades the next working day (T+1).', lesson: 'orders' },
  { text: 'Each trade costs about 0.2% in charges each way: frequent trading adds up.', lesson: 'orders' },
  { text: "P/E is how many years of today's profit you pay for in the price.", lesson: 'pe' },
  { text: "A low P/E can mean cheap, or that profits are expected to fall. Check the sector and the stock's own history.", lesson: 'pe' },
  { text: 'Earnings yield is 1 ÷ P/E: compare it with what T-bills pay.', lesson: 'pe' },
  { text: 'A 30% dividend on a Rs 10 face value share is Rs 3 a share.', lesson: 'dividends' },
  { text: 'Buy at least two working days before book closure to get the dividend.', lesson: 'dividends' },
  { text: 'Selling after the register closes does not lose you the dividend.', lesson: 'dividends' },
  { text: 'The price usually drops by about the dividend on the ex-date.', lesson: 'dividends' },
  { text: 'Bonus shares lower your average cost; your total value stays about the same.', lesson: 'bonus' },
  { text: 'Doing nothing with right shares throws away what the rights are worth.', lesson: 'bonus' },
  { text: 'Judge a quarter against the same quarter last year, not the one before.', lesson: 'results' },
  { text: 'A board meeting notice usually means results within days.', lesson: 'results' },
  { text: 'One bad quarter is not a trend; two or three with falling sales deserve a closer look.', lesson: 'results' },
  { text: 'KSE-100 is "the market": the 100 biggest companies.', lesson: 'indices' },
  { text: 'If you only buy Shariah-compliant shares, compare yourself with the KMI-30.', lesson: 'indices' },
  { text: 'The KMI list is reviewed twice a year: a company can join or leave it.', lesson: 'indices' },
  { text: 'A common guide: no single stock over about 20% of your money.', lesson: 'risk' },
  { text: 'Different sectors fall for different reasons, so spreading across them lowers risk.', lesson: 'risk' },
  { text: 'Keep money you need in the next year or two out of shares.', lesson: 'risk' },
  { text: 'A loss on one sale is set off against gains in the same tax year (July to June).', lesson: 'tax' },
  { text: "Keep your broker's and NCCPL's yearly tax certificates for your return.", lesson: 'tax' },
  { text: 'Capital gains tax is collected for you through the broker when you sell at a profit.', lesson: 'tax' },
];

/** The tip for a day (YYYY-MM-DD), the same all day, a different one each day. */
export function tipFor(day: string): Tip & { lessonIndex: number } {
  const n = Math.floor(Date.parse(day + 'T12:00:00Z') / 864e5);
  const t = TIPS[((n % TIPS.length) + TIPS.length) % TIPS.length];
  return {
    ...t,
    lessonIndex: Math.max(
      0,
      LESSONS.findIndex((l) => l.id === t.lesson),
    ),
  };
}
