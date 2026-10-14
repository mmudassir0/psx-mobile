# Sahm (psx-mobile)

Android app for the Pakistan Stock Exchange: live PSX prices, charts, company data and a paper-trading account. Built with Expo (React Native, TypeScript).

## Where the data comes from
The public PSX data portal, `dps.psx.com.pk`, read directly from the phone:

| Data | Endpoint | Refresh |
| --- | --- | --- |
| Indices (and the request token) | `/indices` (HTML) | every 30 s while the market is open |
| Live prices and volume | `/trading-board/REG/main` (HTML, needs token) | every 30 s while open |
| Fundamentals, Shariah (KMI) membership | `/screener` (HTML) | every 30 min |
| Names and sectors | `/symbols` (JSON, needs token) | daily |
| Charts | `/timeseries/int|eod/{SYMBOL}` (JSON, needs token) | on demand |
| Company page | `/company/{SYMBOL}` (HTML) | on demand |

The portal's own scripts send an `X-Req-Id` header taken from `window.__ps._k` on every page; the app does the same (`src/psx/api.ts`). Parsers live in `src/psx/parse.ts` and are tested against captured pages in `scripts/fixtures`.

## Technical signals
Each stock page shows a technical score (0–10) built from eight rules on daily candles: 200/20-day trend, 50/200-day cross, MACD, RSI, Bollinger bands, volume and on-balance volume, plus support, resistance and a 2× ATR stop. The math lives in `src/analysis/` and is tested in `scripts/test-indicators.ts`, with LUCK values cross-checked against pandas.

## Develop
```bash
npm install
npm test          # parser + paper-engine tests
npm run smoke     # hits the live PSX portal
npm run typecheck
npx expo start    # run in Expo Go / emulator
```

## Build
Every push to `main` builds a release APK on GitHub Actions and attaches it to a GitHub Release.
