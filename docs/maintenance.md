# Looking after Sahm

How the pieces fit, where the secrets live, how to release, and what to do
when something breaks. Written for keeping the app running without help.

## The pieces

| Part | Where | What it does |
|---|---|---|
| App | `App.tsx`, `src/` | Expo SDK 54 / React Native 0.81. Reads PSX directly (`src/psx/api.ts`) and the daily files from the `picks` and `data` branches. |
| Daily job | `scripts/daily-picks.ts`, `.github/workflows/picks.yml` | After the close: picks, market mood, dividend calendar, long-term list, news. Writes JSON to the `picks` branch. Morning run republishes. |
| Alerts | `scripts/portfolio-alerts.ts`, `scripts/watch-alerts.ts` | Evening ntfy notifications for holdings and price rules. Run inside the daily job. |
| Balance sheets | `scripts/fundamentals/`, `.github/workflows/fundamentals.yml` | Daily at 06:17 PKT: reads KSE-100 / KMI-30 reports, writes `fundamentals.json` to the `data` branch. |
| APK build | `.github/workflows/android.yml` | Every push to `main` that touches the app builds a signed APK and publishes a GitHub release. The in-app updater installs releases. |
| Tests | `.github/workflows/tests.yml`, `npm test` | Type check and tests on every push. |

Branches: `main` (code), `picks` (daily files and job state, force-pushed each
run), `data` (balance sheets), `signing` (the encrypted release key — never
delete), `history` / `companies` (backtest data, manual), `probe`,
`ai-eval-results`, `fundamentals-dev` / `fundamentals-samples` (development).

## Schedule

`picks.yml` runs Monday to Friday at 17:13 PKT with backups at 17:47, 18:31,
19:17 and 20:03, and at 08:13 with a backup at 08:41. GitHub often starts
scheduled runs hours late; the first run that gets going does the work and
writes `evening-done.txt`, and the later ones stop in seconds. Alerts are sent
at most once per trading day (`alerts-sent.txt`, `watch-sent.txt`).

From 09:00 to 16:30 PKT on weekdays the job only uses saved closes, so a late
run never publishes half a day as a close (`ALLOW_SESSION=1` overrides).

You can also run it any time: in the app, Settings → Updates → Run update
now (needs a GitHub token with Actions read/write saved there), or on GitHub,
Actions → Daily picks → Run workflow.

GitHub switches schedules off in a public repo after 60 days without a
commit. The job makes a one-line commit to `.github/keepalive.txt` when the
last commit is 45 days old. If schedules ever stop anyway: Actions → Daily
picks → "Enable workflow".

## Secrets (repo Settings → Secrets and variables → Actions)

| Secret | Used for |
|---|---|
| `SAHM_SIGNING_PASSWORD` | Decrypts the release key on the `signing` branch. **Keep a copy somewhere safe.** Without it, a new key is made and the phone refuses the update until Sahm is uninstalled (back up first). |
| `NTFY_ALERT_TOPIC` | Your private ntfy.sh topic for alerts and "job failed" notices. |
| `HOLDINGS_SYMBOLS` | Comma-separated symbols the evening holdings alert checks. Update it when you buy or sell a new stock. |
| `WATCH_ALERTS` | Price-alert rules (Price alerts → Copy, then paste here), e.g. `SYS<100, LUCK>200d, MEBL yield>9, LUCK<fair`. Rules are in `src/analysis/watch.ts`. |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | Weekly AI brief and the AI checks. The app's own keys are saved on the phone, not here. |

Never print these in logs: the repo and its Action logs are public. The
scripts print counts only.

## Releasing

1. Change code, bump `expo.version` in `app.json` (the build number is set
   from the run number).
2. `npx tsc --noEmit && npm test`
3. Push to `main`. About 15 minutes later the release appears and the app
   offers the update. A newer push cancels a build still running.

Local: `npm ci`, `npx expo start` (web preview: `npx expo start --web`;
PSX blocks browsers, so live prices only work on the phone).

## When something breaks

You get an ntfy notice ("Sahm: daily update failed") when a scheduled job
fails. Tap it to see the failed step.

**1. PSX changed its website** (most likely). Prices, charts or the job fail
with parse errors. Run `npm run smoke` to check every PSX call against the live
site and see which one broke. Calls are in `src/psx/api.ts`, parsing in
`src/psx/parse.ts` (tested by `scripts/test-parsers.ts` with saved pages in
`scripts/fixtures`). Save a fresh page as a fixture, fix the parser, run the
tests.

**2. The schedule stopped.** No notice, but the app shows the picks as days
old. Check Actions → Daily picks. Re-enable it if GitHub disabled it, or run it
by hand.

**3. A Groq model was retired.** The AI answers "model not found" or similar.
Model names are in `src/ai/cloud.ts` (`CLOUD_MODELS`) and
`src/portfolio/screenshot.ts` (`GROQ_VISION`, for reading broker screenshots).
Pick current ones from console.groq.com/docs/models. Spoken questions use Groq's Whisper (`WHISPER_MODELS` in `src/ai/voice.ts`).

**4. A news feed moved.** News stops from one source. Feeds are listed in
`src/analysis/news.ts` (`NEWS_FEEDS`); `scripts/probe-news.ts` tests them.

**Economy figures stop updating.** The daily job reads the SBP homepage's
"key indicators" box (policy rate, T-bills, PIBs, KIBOR, dollar, reserves),
the inflation chart on the PBS homepage, and petrol prices from the business
news feeds; parsers are in `src/analysis/macro.ts`, tested with the saved
pages in `scripts/fixtures` (`sbp_home.txt`, `pbs_inflation_chart.txt`).
`scripts/probe-macro.ts` (run with the Probe workflow) shows what each page
returns. A missing figure keeps its last value, so the screen goes stale
rather than blank.

**5. Calendar needs a new year.** Every year, add PSX holidays and the
State Bank's rate-decision dates to `src/analysis/events.ts` (`PSX_HOLIDAYS`,
`MPC_DATES`). Rate decisions are listed to June 2027; holidays for 2026,
plus 2027's fixed-date ones (add Eid, Ashura and Milad, marked `*`, from
the list PSX publishes in December). The SBP publishes its schedule each
June.

Also yearly: the capital gains tax rates in `src/portfolio/tax.ts` follow the
Finance Act each June.

## Your data

Holdings, trades, snapshots and settings live only on the phone. Settings →
Your data → Automatic backup writes a backup every week to a folder you
choose (the last four are kept). On a new phone, copy that folder across,
then use "Restore from the backup folder". The backup never includes API keys.

## Problem log

Settings → Problem log keeps the last 150 crashes and failed downloads on the
phone, with keys blanked out. Send shares it as text.
