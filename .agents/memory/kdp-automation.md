---
name: KDP Upload Automation
description: Architecture decisions for the KDP book upload automation app — agent, browser session, and sequencing approach.
---

## Agent runner
- Uses Claude claude-sonnet-4-6 vision (Replit Anthropic integration — no user API key needed)
- Single headless Chromium instance shared across all job runs to preserve the user's logged-in KDP session
- Max 40 steps per job; screenshots every 5 steps + on error/completion
- Screenshots stored at `artifacts/api-server/uploads/screenshots/` and served as `/api/screenshots/<file>`

## Job sequencing
- Jobs run sequentially (not in parallel) to avoid KDP bot detection / rate limits
- Three formats per book: ebook, paperback, hardcover — each is a separate UploadJob row

## Book scanner
- Source: https://scripturemadesimple.replit.app/my-studies (user's own Replit app)
- Uses cheerio for HTML parsing; two-pass strategy: deep scan first, heading-proximity fallback
- New books get 3 pending UploadJob rows created automatically on discovery

**Why sequential jobs:** KDP will flag suspicious rapid concurrent uploads from the same account as bot activity. Sequential runs look more human.

**Why shared browser:** Preserving cookies/session means the user only needs to log in once manually; the agent inherits the session across all runs.
