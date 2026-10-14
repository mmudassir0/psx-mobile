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

## Stock page
Six tabs: Overview (chart, day and 52-week range, bid/ask, circuit breakers), Technicals (oscillators, moving averages and pivot points with Buy/Sell readings, plus the signal score), Fundamentals (annual and quarterly sales, profit, EPS, margins, PEG from the PSX company page), Announcements (filterable by category, PDF links), Profile (key people, auditor, registrar, website) and Peers (same-sector companies).

## Balance-sheet ratios
ROE, ROA, book value, P/B, current ratio and debt ratios need figures PSX doesn't publish, so they come from each company's own report. The `Fundamentals` workflow (Mon and Thu, or run it by hand) finds each KSE-100 company's latest report on PSX, locates the standalone balance sheet (OCR where the page is scanned), has a model on Groq's free tier read it, and then checks every figure in code: it must appear on the page in the current-period column, assets must equal equity + liabilities, and borrowings are summed from verified lines. Failures are logged, never published. Results go to `fundamentals.json` on the `data` branch and every APK build bundles them; the app computes the ratios with live prices and links to the source report. Needs the `GROQ_API_KEY` repository secret. Code: `scripts/fundamentals/`, `src/analysis/ratios.ts`.

## On-phone AI
Each stock has an AI tab with a written verdict (trend, entry, stop, target, risks, news), and the AI tab has "Ask Sahm", a chat about stocks, sectors and the market. Both run on a free model on the phone itself: Ollama in Termux at `http://127.0.0.1:11434` (setup guide in the app). The app builds a compact data pack from its own calculations (`src/ai/context.ts`, `src/ai/chat.ts`) and the model only explains it; "What the AI reads" shows the exact pack. Streaming uses XMLHttpRequest progress events (`src/ai/ollama.ts`). Android needs cleartext HTTP for localhost, set in `app.json`.

## Themes
White by default; Dark or "follow the phone" in Settings (gear on Home). Colors live in `src/theme.ts`; stylesheets that use them are wrapped in `themed()` so they rebuild when the theme changes.

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
