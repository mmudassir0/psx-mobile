# Backtest of Sahm's technical score

Run it again: Actions → **Price history** (downloads every listed stock to the
`history` branch and writes `study.txt` there), or locally with
`npx tsx scripts/backtest-study.ts <history dir>`.

Method: for every stock and every trading day since the 200-day average
exists, the rules are evaluated with only the prices known that day
(`rulesAt`; a test proves it matches the app's score on truncated history).
Outcomes are the price change 5, 10 and 20 trading days later, clipped at ±40%.
"Liquid" means a median traded value of at least Rs 5M a day over the
previous 60 sessions. 2017–2021 was used to choose changes; 2022 onwards to
check them.

## Findings (October 2026, 465 stocks, 741k stock-days, 252k liquid)

- On **all stocks** the score had no edge: thinly traded stocks don't trend.
  The app now caps confidence at Low below Rs 5M a day and says why.
- On **liquid stocks** the v0.12 score had a small edge: bullish days beat
  bearish days by 0.46% (2017–21) and 0.31% (2022+) over 10 days.
- Bollinger band breaks and RSI extremes behaved as **momentum**: closes above
  the upper band and RSI over 70 were followed by *above-average* returns in
  both periods. The old rules read them as reversal signals.
- Short-term trend (price vs 20-day average) and MACD carried most of the
  edge; the 200-day trend and 50/200 cross were weak at these horizons.

## Change in v0.13

| rule | v0.12 | v0.13 |
|---|---|---|
| Long-term trend (200-day) | 2 | 1 |
| 50/200-day cross | 1.5 | 1 |
| Short-term trend (20-day) | 1 | 2 |
| MACD | 1 | 1.5 |
| RSI | 0.5, extremes 1 as reversal | 0.5, extremes as momentum |
| Bollinger bands | 0.5 as reversal | 0.5 as breakout |
| Volume, OBV | 0.5 each | unchanged |

Liquid stocks, 10 days, bullish-day average minus bearish-day average:

| | 2017–21 | 2022+ | 20-day, 2017–21 | 20-day, 2022+ |
|---|---|---|---|---|
| v0.12 | 0.46% | 0.31% | 0.53% | 0.39% |
| v0.13 | 0.74% | 0.62% | 0.94% | 0.93% |

Stocks where bullish days beat the stock's own average day: 108/189 → 122/193.

This is still a modest edge with a hit rate close to a coin flip (about 46–48%
of bullish days were followed by a rise, against 45–47% for all days). The
score is a tilt in the odds, not a prediction, and the app says so.

# Backtest of fair value

Run it again: Actions → **Company results** (after **Price history**); it
writes `fair-study.txt` to the `companies` branch. Locally:
`npx tsx scripts/fair-study.ts <history dir> <companies dir>`.

Method: on 13 quarterly dates from April 2023, every company is valued with
only what was public then: its latest fiscal-year profit (counted from 100
days after the year end), prices up to that date, and sector peers valued the
same way. Only the two P/E methods can be tested; the book-value methods need
past balance sheets. Then the next 6 and 12 months' returns are compared.
Companies delisted since are missing, which flatters all returns a little.

## Findings (October 2026, 486 companies, 3,143 valuations, 1,332 liquid)

Liquid stocks, next 12 months:

| label | valuations | average | median | rose |
|---|---|---|---|---|
| Undervalued | 290 | +49.6% | +32.7% | 70% |
| Fairly valued | 217 | +41.9% | +19.3% | 70% |
| Overvalued | 532 | +32.7% | +18.7% | 67% |

- Pooled, cheap stocks clearly beat dear ones (all stocks: +64.6% against
  +48.3%).
- But the edge was not steady. Undervalued beat Overvalued by 20–39 points for
  valuations made from April 2023 to January 2024, and in October 2024; April
  and July 2024 went the other way (−7 and −20). From January 2025 the gap
  was between −5 and +5 points. Most of the edge came from
  the 2023–24 re-rating of cheap stocks.
- "Overvalued against its own past P/E" was the clearest warning: the most
  expensive fifth on that measure rose a median 2% over 12 months, against
  13% for all the stocks it could value.

So the verdict counts fair value as one ordinary fundamental point (weight 1,
replacing the plain P/E-vs-sector point), not more.

# Backtest of daily trade picks (WhatsApp-group style)

`npx tsx scripts/picks-study.ts <history dir>` (env ZONE, STOP, TP1, TP2, HOLD,
BREADTH change the rules). Every liquid stock-day with a setup (pullback in an
uptrend, breakout on 1.5× volume, Sahm strong-bullish score) becomes a pick:
buy zone half an ATR under the close, stop under the zone, half sold at TP1
(stop then moves to entry), rest at TP2, stop or time. Bought only if the zone
trades within 3 days. Stop assumed first when a day touches both. 0.3% costs.
"any-day" is the same trade on random liquid days, with no setup.

Average return per trade, after costs (October 2026):

| rules | period | any day | pullback | breakout | momentum |
|---|---|---|---|---|---|
| stop 1 ATR, TP 1R/2R, 10 days (group style) | 2017–21 | −0.56% | −0.74% | −0.46% | −0.61% |
| | 2022+ | −0.37% | −0.41% | −0.51% | −0.29% |
| stop 2 ATR, TP 1R/3R, 20 days | 2017–21 | −0.85% | −1.02% | −0.45% | −0.64% |
| | 2022+ | −0.02% | +0.23% | −0.37% | +0.38% |
| stop 3 ATR, TP 2R/4R, 40 days | 2017–21 | −1.28% | −0.79% | +0.37% | −0.10% |
| | 2022+ | +1.37% | +2.19% | +1.19% | +2.34% |

- Group-style picks (tight stop, quick targets) lost money in every test, even
  with a 50–56% "win rate": wins and losses are about the same size and costs
  tip it negative.
- Longer, wider trades made money only in the 2022+ bull market, where buying
  any liquid stock on any day also did; setups added about one point at most,
  and did not hold up in 2017–21.
- A market filter (trade only when at least half of liquid stocks are above
  their 200-day average) kept out of most of 2017–21 but did not make the
  trades it allowed profitable.
