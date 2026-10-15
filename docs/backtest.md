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
