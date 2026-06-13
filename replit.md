# KDP Upload Automation

An AI-powered dashboard that automatically discovers new book titles from scripturemadesimple.replit.app/my-studies and uploads them to Amazon KDP using Claude computer use vision + Playwright browser automation. Three agent swarms handle Kindle eBook, Paperback, and Hardcover uploads in parallel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/kdp-uploader run dev` — run the dashboard frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — auto-set by Replit Anthropic integration
- Optional env: `CDP_ENDPOINT` — set to `http://localhost:9222` when running locally with Chrome remote debugging (see Local Machine Setup below)

## Local Machine Setup

When running on a local computer, the app connects directly to your existing Chrome browser session so it can reuse your live Amazon KDP login — no separate login or headless browser needed.

### Step 1 — Launch Chrome with remote debugging enabled

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-kdp-profile"
```

**Windows (run as Administrator):**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%USERPROFILE%\chrome-kdp-profile"
```

> The `--user-data-dir` flag creates a separate Chrome profile just for this tool, so it doesn't conflict with your regular Chrome window. You only need to log into KDP, Google, etc. once in this profile — it persists across restarts.

### Step 2 — Open the three required tabs in that Chrome window

1. **Amazon KDP Bookshelf** — `https://kdp.amazon.com/en_US/bookshelf` (log in to your KDP account)
2. **My Study Guides** — `https://scripturemadesimple.replit.app/my-studies`
3. **KDP Upload Automation** — `http://localhost:3000` (or wherever the frontend is served)

### Step 3 — Set environment variables

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` and fill in:

```env
DATABASE_URL=postgresql://...
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-...
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
SESSION_SECRET=<any long random string>
CDP_ENDPOINT=http://localhost:9222
PORT=8080
```

### Step 4 — Start the app

```bash
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/kdp-uploader run dev # Dashboard on :3000
```

When `CDP_ENDPOINT` is set, every browser action (uploads, bookshelf scans) opens a new tab in your existing Chrome window. The new tab inherits all cookies, so KDP is already logged in. After the action finishes, the tab is closed automatically.

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Wouter routing, TanStack Query, Shadcn/ui)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Browser automation: Playwright (CDP connection to existing Chrome, or headless fallback)
- AI vision: Claude claude-sonnet-4-6 via Replit Anthropic integration
- Scheduling: node-cron

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB tables: books, upload_jobs, job_logs, schedule_config
- `artifacts/api-server/src/lib/agent-runner.ts` — Claude computer use + Playwright agent
- `artifacts/api-server/src/lib/kdp-bookshelf-scanner.ts` — KDP bookshelf status scanner
- `artifacts/api-server/src/lib/book-scanner.ts` — scraper for scripturemadesimple.replit.app
- `artifacts/api-server/src/lib/scheduler.ts` — node-cron scheduler
- `artifacts/api-server/uploads/screenshots/` — agent screenshots stored here
- `artifacts/api-server/.env.example` — example environment file for local setup
- `artifacts/kdp-uploader/src/` — dashboard frontend

## Architecture decisions

- Agent runner uses Claude claude-sonnet-4-6 vision to interpret screenshots and decide actions, making it resilient to KDP UI layout changes.
- Browser access is via CDP connection to the user's existing Chrome (local mode) or a headless Chromium instance (Replit/CI mode). Single shared browser context preserves the KDP session.
- Jobs run sequentially (not parallel) to avoid triggering KDP rate limits or bot detection.
- Bookshelf scanner runs at the start of each scheduled cycle to update live/review/draft status per format before deciding which jobs to run. Already-live formats are skipped.
- Book scanner parses scripturemadesimple.replit.app with cheerio; falls back to heading-proximity scan if the deep strategy finds nothing.
- Screenshots saved to disk and served as static files under `/api/screenshots/` for display in the dashboard.

## Product

- Dashboard: real-time stats, Scan Now + KDP Shelf + Run All buttons, Live on KDP counter
- Books Catalog: all discovered titles with upload job status and KDP live status (eBook/PB/HC) per row
- Book Detail: assets, KDP content data, job cards per format with full log view
- Job Monitor: all jobs filterable by status and format, auto-polls while jobs are running
- Schedule Config: enable/disable automation, edit cron expression (default: hourly)

## User preferences

- Use Claude (Anthropic via Replit integration) for the AI vision model — no API key needed
- Three agent swarms: ebook, paperback, hardcover — each runs as a separate UploadJob
- Source URL for book discovery: https://scripturemadesimple.replit.app/my-studies
- Jobs run sequentially to avoid KDP rate limiting

## Gotchas

- `CDP_ENDPOINT` must point to Chrome started with `--remote-debugging-port=9222`. The matching `--user-data-dir` keeps this profile separate from your regular Chrome.
- `pnpm --filter @workspace/db run push` must be run after any schema changes.
- After changing `lib/api-spec/openapi.yaml`, always re-run codegen before typechecking leaf packages.
- Run `pnpm run typecheck:libs` after changing any `lib/*` package before checking artifacts.
- Screenshots directory is auto-created at `artifacts/api-server/uploads/screenshots/`.
- The bookshelf scanner URL is `https://kdp.amazon.com/en_US/bookshelf` (matches the tab shown in the browser).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
