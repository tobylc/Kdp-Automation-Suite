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

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (Wouter routing, TanStack Query, Shadcn/ui)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Browser automation: Playwright (Chromium headless)
- AI vision: Claude claude-sonnet-4-6 via Replit Anthropic integration
- Scheduling: node-cron

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB tables: books, upload_jobs, job_logs, schedule_config
- `artifacts/api-server/src/lib/agent-runner.ts` — Claude computer use + Playwright agent
- `artifacts/api-server/src/lib/book-scanner.ts` — scraper for scripturemadesimple.replit.app
- `artifacts/api-server/src/lib/scheduler.ts` — node-cron scheduler
- `artifacts/api-server/src/routes/` — API route handlers
- `artifacts/api-server/uploads/screenshots/` — agent screenshots stored here
- `artifacts/kdp-uploader/src/` — dashboard frontend

## Architecture decisions

- Agent runner uses Claude claude-sonnet-4-6 vision to interpret screenshots and decide actions, making it resilient to KDP UI layout changes.
- Single Playwright browser instance shared across all agent runs to preserve the user's logged-in KDP session.
- Jobs run sequentially (not parallel) to avoid triggering KDP rate limits or bot detection.
- Book scanner parses scripturemadesimple.replit.app with cheerio; falls back to heading-proximity scan if the deep strategy finds nothing.
- Screenshots saved to disk and served as static files under `/api/screenshots/` for display in the dashboard.

## Product

- Dashboard: real-time stats, Scan Now + Run All buttons, schedule status
- Books Catalog: all discovered titles with per-format upload status badges
- Book Detail: assets, KDP content data, job cards per format with full log view
- Job Monitor: all jobs filterable by status and format, auto-polls while jobs are running
- Schedule Config: enable/disable automation, edit cron expression (default: hourly)

## User preferences

- Use Claude (Anthropic via Replit integration) for the AI vision model — no API key needed
- Three agent swarms: ebook, paperback, hardcover — each runs as a separate UploadJob
- Source URL for book discovery: https://scripturemadesimple.replit.app/my-studies
- Jobs run sequentially to avoid KDP rate limiting

## Gotchas

- The Playwright browser must have an active KDP session — the user keeps a browser session open and the agent reuses it. Since the agent runs headless, first-time KDP login needs to be handled manually or by navigating to KDP in a visible browser first.
- `pnpm --filter @workspace/db run push` must be run after any schema changes.
- After changing `lib/api-spec/openapi.yaml`, always re-run codegen before typechecking leaf packages.
- Run `pnpm run typecheck:libs` after changing any `lib/*` package before checking artifacts.
- Screenshots directory is auto-created at `artifacts/api-server/uploads/screenshots/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
