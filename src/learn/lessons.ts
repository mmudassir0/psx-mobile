/**
 * Learn PSX: ten short lessons for beginners, each with an example from your own
 * holdings when Sahm has the figures, a place in Sahm to try it, and one
 * question to check it stuck.
 */
import { DEADLINE_DAYS } from '../analysis/results';

export interface LessonCtx {
  /** your biggest holding with the figures it has */
  top: { symbol: string; shares: number; price: number; avgCost: number; pe: number | null; divYield: number | null; dps: number | null; sector: string | null } | null;
  holdings: number;
  /** share of your money in your biggest holding, 0–1 */
  topWeight: number | null;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  body: string[];
  example?: (c: LessonCtx) => string | null;
  /** a screen in Sahm to try it */
  tryIt?: { label: string; route: string; params?: object };
  check: { q: string; options: string[]; answer: number; why: string };
}

const rs = (v: number) => `Rs ${Math.round(v).toLocaleString('en-US')}`;

export const LESSONS: Lesson[] = [
  {
    id: 'share',
    title: 'What a share is',
    minutes: 2,
    body: [
      'A share is a small piece of a company. Own one and you own a slice of its business: its profits, its dividends and, if it grows, a bigger value.',
      'Listed companies trade on the Pakistan Stock Exchange (PSX). The price moves because people buy and sell all day: more buyers than sellers pushes it up, more sellers pushes it down.',
      "Over a day the price is mostly noise. Over years it follows the company's profits. That's why investors look at the business, not just the chart.",
    ],
    example: (c) => (c.top ? `You own ${c.top.shares.toLocaleString('en-US')} shares of ${c.top.symbol}, worth ${rs(c.top.shares * c.top.price)} at Rs ${c.top.price.toFixed(2)} each.` : null),
    tryIt: { label: 'See the market today', route: 'Tabs', params: { screen: 'Market' } },
    check: {
      q: 'Over many years, what mostly decides a share price?',
      options: ['How many people talk about it', "The company's profits", 'The time of day'],
      answer: 1,
      why: "Day to day it's buying and selling; over years prices follow what the business earns.",
    },
  },
  {
    id: 'account',
    title: 'Getting started',
    minutes: 3,
    body: [
      'You buy shares through a broker licensed by the SECP (for example KTrade). The broker opens a CDC account for you: the Central Depository holds your shares electronically in your name.',
      'NCCPL settles the trades and works out capital gains tax. Dividends go straight to the bank account (IBAN) on your CDC record, so keep it right.',
      "Being on the FBR's Active Taxpayers List (a filer) halves the tax on dividends and lowers it on gains. Set your status in Sahm's Settings so its figures match.",
    ],
    tryIt: { label: 'Set your tax status', route: 'Settings' },
    check: {
      q: 'Where are your shares actually held?',
      options: ['In your CDC account', "In the broker's own name", 'On paper certificates at home'],
      answer: 0,
      why: 'The CDC holds them for you in your name; the broker places the orders.',
    },
  },
  {
    id: 'orders',
    title: 'Buying and selling',
    minutes: 3,
    body: [
      'A market order buys or sells straight away at the best price on offer. A limit order says your price ("buy at Rs 400 or less") and waits until someone matches it.',
      'Trades settle the next working day (T+1): the shares and money change hands then. Every trade has charges: brokerage plus PSX, CDC and NCCPL fees and sales tax, about 0.2% each way at the usual rates.',
      'PSX limits how far a share can move in one day (circuit breakers), so a share can hit its limit and stop trading lower or higher until the next day.',
    ],
    example: (c) => (c.top ? `Selling all your ${c.top.symbol} at Rs ${c.top.price.toFixed(2)} would cost about ${rs(c.top.shares * c.top.price * 0.002)} in charges, before any tax.` : null),
    tryIt: { label: 'Plan a sale', route: 'SellPlan' },
    check: {
      q: 'You want to buy only if the price is Rs 400 or less. Which order?',
      options: ['Market order', 'Limit order at 400', 'Either, it makes no difference'],
      answer: 1,
      why: "A limit order won't fill above your price; a market order takes whatever is on offer.",
    },
  },
  {
    id: 'pe',
    title: 'Price, profit and P/E',
    minutes: 3,
    body: [
      "EPS is the profit per share over the last year. P/E is the price divided by EPS: how many years of today's profit you pay for.",
      'A low P/E can mean cheap, or it can mean the market expects profits to fall. Compare a stock with its own past and its sector, not with every other stock.',
      'Sahm shows each stock against its sector (Peers tab) and against its own history (P/E band on the stock page).',
    ],
    example: (c) =>
      c.top?.pe
        ? `${c.top.symbol}'s P/E is ${c.top.pe.toFixed(1)}: at Rs ${c.top.price.toFixed(2)} you pay for about ${c.top.pe.toFixed(1)} years of its last year's profit (EPS about Rs ${(c.top.price / c.top.pe).toFixed(2)}).`
        : null,
    tryIt: { label: 'Words explained', route: 'Glossary' },
    check: { q: 'A share at Rs 100 earned Rs 10 a share last year. Its P/E is…', options: ['10', '1', '100'], answer: 0, why: '100 ÷ 10 = 10: ten years of that profit.' },
  },
  {
    id: 'dividends',
    title: 'Dividends',
    minutes: 3,
    body: [
      'A dividend is cash the company pays from its profit. PSX announcements give it as a % of face value: with the usual face value of Rs 10, a 50% dividend is Rs 5 a share.',
      "To get it, your shares must be on the register the day before book closure. With T+1 settlement that means buying at least two working days before book closure starts. Selling after that doesn't lose it.",
      'Tax is taken before it reaches your bank: 15% for filers on most companies, more for non-filers. The price usually drops by about the dividend when the share goes ex.',
    ],
    example: (c) =>
      c.top?.dps
        ? `${c.top.symbol} paid about Rs ${c.top.dps.toFixed(2)} a share over the last year: about ${rs(c.top.dps * c.top.shares * 0.85)} on your shares after 15% tax.`
        : c.top?.divYield
          ? `${c.top.symbol}'s dividend yield is ${c.top.divYield.toFixed(1)}%.`
          : null,
    tryIt: { label: 'Dividend calendar', route: 'Dividends' },
    check: { q: 'Face value Rs 10, dividend announced 30%. Cash per share?', options: ['Rs 30', 'Rs 3', 'Rs 0.30'], answer: 1, why: '30% of the Rs 10 face value is Rs 3.' },
  },
  {
    id: 'bonus',
    title: 'Bonus and right shares',
    minutes: 3,
    body: [
      "Bonus shares are free extra shares (10% bonus: 1 new share for every 10). The price adjusts down, so your total value doesn't jump; your average cost per share goes down.",
      'Right shares are new shares offered to you at a set price, usually below the market. You can pay for them (subscribe), sell the right to buy them while it trades, or do nothing, which loses their value.',
      'Sahm adds bonus shares to your holding once they settle, and the rights box on a holding works out all three choices in rupees.',
    ],
    tryIt: { label: 'My holdings', route: 'Tabs', params: { screen: 'Portfolio' } },
    check: {
      q: "You hold 100 shares and get a 20% bonus. What happens to your holding's value that day?",
      options: ['It goes up 20%', 'About the same: the price adjusts', 'It halves'],
      answer: 1,
      why: 'You have 120 shares, but each is worth less; the total stays about the same.',
    },
  },
  {
    id: 'results',
    title: 'Reading results',
    minutes: 3,
    body: [
      `Companies publish results every quarter: within ${DEADLINE_DAYS.quarter} days of a quarter's end, ${DEADLINE_DAYS.half} for the half year and ${DEADLINE_DAYS.year} for the full year. A board meeting notice usually comes a few days before.`,
      'Look first at profit after tax and EPS against the same period last year (not the quarter before: many businesses are seasonal). Then sales, and whether a dividend came with it.',
      'One bad quarter is not a trend. Two or three in a row, with falling sales, is worth a closer look.',
    ],
    tryIt: { label: 'Results season', route: 'Results' },
    check: {
      q: 'Best way to judge a quarter?',
      options: ['Against the quarter before', 'Against the same quarter last year', 'Against the share price'],
      answer: 1,
      why: 'The same quarter a year earlier removes seasonal ups and downs.',
    },
  },
  {
    id: 'indices',
    title: 'Indices and Shariah',
    minutes: 2,
    body: [
      'The KSE-100 tracks the 100 biggest companies: "the market". KSE-30 and All Share are other views of it.',
      'KMI All Share lists every company that passes the Shariah screening (business, debt, interest income and other tests); KMI-30 is its 30 biggest. The list is reviewed twice a year.',
      'Comparing your return with the KSE-100, or the KMI-30 if you only buy Shariah-compliant shares, tells you whether picking stocks beat simply owning the market.',
    ],
    tryIt: { label: 'Shariah corner', route: 'Shariah' },
    check: { q: 'You only buy Shariah-compliant shares. The fairer index to compare with?', options: ['KSE-100', 'KMI-30', 'Neither'], answer: 1, why: "KMI-30 is made of the kind of shares you're allowed to own." },
  },
  {
    id: 'risk',
    title: 'Risk and spreading it',
    minutes: 3,
    body: [
      "Any one company can have a bad year. Spreading your money over several stocks and sectors means one problem doesn't sink everything.",
      'A common rule of thumb: no single stock over about 20% of your money, and no single sector over a third. Keep money you need in the next year or two out of shares, and never invest borrowed money.',
      "The KSE-100 has fallen 30% or more several times. Sahm's stress test shows how your holdings did in those falls.",
    ],
    example: (c) =>
      c.top && c.topWeight != null
        ? `${c.top.symbol} is ${(c.topWeight * 100).toFixed(0)}% of your money${c.topWeight > 0.2 ? ': more than the usual 20% guide' : ''}, across ${c.holdings} holding${c.holdings === 1 ? '' : 's'}.`
        : null,
    tryIt: { label: 'Sector limits', route: 'SectorLimits' },
    check: {
      q: 'Which spreads risk best?',
      options: ['All money in the stock you know best', 'Several stocks across different sectors', 'Several banks'],
      answer: 1,
      why: 'Different sectors fall for different reasons, so they rarely all fall together.',
    },
  },
  {
    id: 'tax',
    title: 'Tax and zakat',
    minutes: 3,
    body: [
      'Capital gains tax is taken when you sell at a profit: for filers it is 15% on shares bought from July 2024 (older shares have other rates). NCCPL works it out through your broker. A loss in the same tax year (July to June) is set off against gains.',
      'Dividend tax is withheld before payment. Keep the yearly tax certificate from your broker and NCCPL for your return.',
      "On zakat: scholars differ on how to value shares. Sahm shows two common ways (market value for shares bought to sell; the company's zakatable assets for shares held for dividends). If zakat is deducted at source, a CZ-50 declaration may apply.",
    ],
    tryIt: { label: 'Tax statement', route: 'TaxStatement' },
    check: {
      q: 'You sold one stock at a Rs 10,000 profit and another at a Rs 4,000 loss in the same tax year. Taxable gain?',
      options: ['Rs 10,000', 'Rs 6,000', 'Rs 14,000'],
      answer: 1,
      why: 'The loss is set off against the gain first: 10,000 − 4,000.',
    },
  },
];

export interface LearnProgress {
  done: string[];
  /** answers right first time */
  right: string[];
}
