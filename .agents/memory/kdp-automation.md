---
name: KDP Upload Automation
description: Architecture decisions for the KDP book upload automation app — agent, browser session, sequencing, and workflow SOPs.
---

## Agent runner (complete rewrite — three master SOPs embedded)
- Uses Claude claude-sonnet-4-6 vision (Replit Anthropic integration — no user API key needed)
- Single headless Chromium instance shared across all job runs to preserve the user's logged-in KDP session
- Max 150 steps per job; screenshot every step + stored to disk + DB updated each step
- Screenshots stored at `artifacts/api-server/uploads/screenshots/`, served as `/api/screenshots/<file>`
- Assets downloaded to `artifacts/api-server/uploads/assets/{bookId}/` before agent starts

## Three master workflows (100-hour trained SOPs)
Master workflow files saved at `artifacts/api-server/src/lib/workflows/`:
- `ebook-master.md` — eBook: $2.99, KDP Select, 70% royalty, cover JPG upload
- `paperback-master.md` — Paperback: $9.99, Cover Creator, Print Previewer approval, Expanded Distribution
- `hardcover-master.md` — Hardcover: $19.999 (NOT 19.99 — avoids derived marketplace errors), Cover Creator, Print Previewer, click Done

## Fixed values that never change
- Author: Noah Peterson (first: Noah, last: Peterson) — never the original book author
- Subtitle: "An Independent Companion Study Guide & Spiritual Formation Workbook" (with ampersand)
- Series: "The Reflective Reader"
- AI content: Yes / "Entire work, with extensive editing" / "custom AI" / Images: None / Translations: None

## Critical workflow rules
- Vision-verified paste gate: after EVERY paste/type, take screenshot and verify text is in correct field
- Cover Creator: always choose TRUE TOP-LEFT design thumbnail (not top-right which is wrong coordinates)
- Hardcover price: use 19.999 not 19.99 — 19.99 causes derived marketplace validation errors
- Print Previewer (both paperback and hardcover): mandatory — must launch, review, and click yellow Approve
- Spine text: delete ONLY if Cover Creator explicitly shows "not thick enough" spine error
- Yellow box: read + follow + click any checkbox. Red box: stop and fix before proceeding

## Asset URLs per book (extracted from DB fields, not a separate column)
- Manuscript: extracted from `manuscriptUrl` pattern `/download/{id}/6x9`
- Cover PNG: extracted from `coverPngUrl` pattern `/download-uploaded-cover/{id}/png`
- Cover JPG: extracted from `coverJpgUrl` pattern `/download-uploaded-cover/{id}/jpg`
- booksTable has NO `studyId` column — extract ID from URL field regexes

## Human-like interaction patterns
- Random delays 200-1500ms between actions (not fixed waits)
- Mouse moves to element with steps=8 before clicking
- File uploads via `page.waitForEvent("filechooser")` interception
- New tabs (Print Previewer) auto-detected via `context.pages()` after each action

## Job sequencing
- Jobs run sequentially (not in parallel) to avoid KDP bot detection / rate limits
- Three formats per book: ebook → paperback → hardcover — each is a separate UploadJob row
- Manuscript download failure → job fails immediately (cannot upload without manuscript)

**Why 19.999 for hardcover:** KDP's derived marketplace price calculation fails with 19.99, showing red "Please enter a price" on non-US marketplaces. 19.999 rounds to $20.00 displayed but clears all validation.
**Why sequential jobs:** KDP will flag suspicious rapid concurrent uploads as bot activity.
**Why shared browser:** Preserving cookies/session means the user only needs to log in once manually.
