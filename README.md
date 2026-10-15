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

## AI
Every stock's AI tab starts with **Sahm's verdict**, decided in code (`src/ai/verdict.ts`): technical score plus a fundamental score (valuation vs sector, EPS growth, quarter vs a year earlier, ROE, debt, current ratio, dividend), combined into Bullish/Neutral/Bearish with a confidence and levels (buy zone, stop, target, reward/risk; or "wait" with a holders' stop and trigger when bearish). The AI then explains that verdict; it never decides it. In the "Ask Sahm" chat, rankings ("cheapest cement", "best dividend") and side-by-side comparisons are computed in code (`src/ai/chat.ts`) and handed to the model.

Engines, chosen in Settings → AI (Auto / Online / On phone), tried in this order:
- **Gemini** with the user's own key (Google's Interactions API, `src/ai/gemini.ts`): their choice of 3.8 Flash (free tier), 3.1 Pro or 4 Argon (billing or Developer Program credits), falling back to Flash.
- **Groq** free tier: GPT-OSS 120B, then 20B (`src/ai/cloud.ts`). Keys are stored with `expo-secure-store`; `chain()` moves to the next provider only on offline, rate-limit or availability errors.
- **On phone:** llama.cpp via `llama.rn` with a downloaded model: Qwen3 4B (recommended, 2.5 GB) or Qwen2.5 1.5B (1.1 GB), with pause/resume and a size check (`src/ai/engine.ts`, `src/store/ai.tsx`). Phone models get a compact data pack to cut the wait before the first word.

**Ask in another app:** each stock's AI tab and each chat answer can send the full prompt (instructions, verdict, data) to the Gemini, Claude or ChatGPT app through Android's share sheet (`src/ai/share.ts`), so the answer comes from the user's own account there.

`.github/workflows/ai-eval.yml` runs the real prompts on live PSX data with each model (llama.cpp built from source, same engine as the app) and Groq, saving answers and speeds to the `ai-eval-results` branch.

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
