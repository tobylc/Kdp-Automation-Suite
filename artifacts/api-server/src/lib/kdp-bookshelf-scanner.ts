/**
 * KDP Bookshelf Scanner
 *
 * Uses the shared Playwright browser (inheriting the live KDP session) to navigate
 * the Amazon KDP bookshelf, extract per-format status for every title across all
 * paginated pages, and update the database so the automation skips already-live books.
 */

import { getBrowser } from "./agent-runner";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import path from "path";
import fs from "fs";

const KDP_BOOKSHELF_URL = "https://kdp.amazon.com/en_US/title-setup/dashboard";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "artifacts/api-server/uploads/screenshots");

export type KdpFormatStatus =
  | "live"
  | "in_review"
  | "publishing"
  | "draft"
  | "blocked"
  | "not_created";

interface KdpTitleEntry {
  kdpTitle: string;
  ebookStatus: KdpFormatStatus;
  paperbackStatus: KdpFormatStatus;
  hardcoverStatus: KdpFormatStatus;
}

interface PageExtraction {
  titles: KdpTitleEntry[];
  hasNextPage: boolean;
}

export interface BookshelfScanResult {
  scanned: number;
  updated: number;
  message: string;
}

// ─── Title matching ────────────────────────────────────────────────────────────

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

/**
 * KDP shows "Title: Subtitle" — our DB stores just the base title.
 * A match is when the DB title is at the leading part of the KDP title,
 * or the two strings are identical after normalisation.
 */
function titlesMatch(dbTitle: string, kdpTitle: string): boolean {
  const db = normalizeTitle(dbTitle);
  const kdp = normalizeTitle(kdpTitle);
  if (db === kdp) return true;
  if (kdp.startsWith(db + ":") || kdp.startsWith(db + " -")) return true;
  // Broader fallback: KDP title contains the DB title as a substring
  return kdp.includes(db);
}

// ─── Claude vision extraction ─────────────────────────────────────────────────

async function extractPageData(screenshotPath: string): Promise<PageExtraction> {
  const imageData = fs.readFileSync(screenshotPath);
  const base64Image = imageData.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64Image },
          },
          {
            type: "text",
            text: `You are reading a screenshot of the Amazon KDP (Kindle Direct Publishing) Bookshelf page.

Your task: extract ALL title/book entries visible on this page along with their per-format publishing statuses.

For EACH title card or row shown, identify:
- kdpTitle: the full title text as displayed (include subtitle if visible)
- ebookStatus: the Kindle eBook format status
- paperbackStatus: the Paperback format status
- hardcoverStatus: the Hardcover / Hardback format status

Map KDP status labels to these exact normalized values:
  "LIVE" / "Live"                                  → "live"
  "In Review" / "In review" / "Submitted"           → "in_review"
  "Under Review" / "Under review"                   → "in_review"
  "Publishing"                                      → "publishing"
  "Draft" / "Not published"                         → "draft"
  "Blocked"                                         → "blocked"
  Format not created / not started / not visible    → "not_created"

Also determine:
- hasNextPage: true if there is a visible, enabled "Next" page button or "›" / ">" pagination control

Respond ONLY with valid JSON — no prose, no markdown fences:
{
  "titles": [
    {
      "kdpTitle": "Full Book Title Here",
      "ebookStatus": "live",
      "paperbackStatus": "in_review",
      "hardcoverStatus": "not_created"
    }
  ],
  "hasNextPage": false
}`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  // Strip any accidental markdown fences
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ raw }, "bookshelf-scanner: no JSON found in Claude response");
    return { titles: [], hasNextPage: false };
  }

  try {
    return JSON.parse(jsonMatch[0]) as PageExtraction;
  } catch (err) {
    logger.warn({ err, raw }, "bookshelf-scanner: failed to parse Claude JSON");
    return { titles: [], hasNextPage: false };
  }
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanKdpBookshelf(): Promise<BookshelfScanResult> {
  logger.info("KDP bookshelf scan started");

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const { context } = await getBrowser();
  const page = await context.newPage();

  const allEntries: KdpTitleEntry[] = [];
  let pageNum = 0;

  try {
    await page.goto(KDP_BOOKSHELF_URL, { waitUntil: "networkidle", timeout: 30_000 });
    // Give React SPA time to fully render
    await page.waitForTimeout(3000);

    let hasMorePages = true;

    while (hasMorePages) {
      pageNum++;
      logger.info({ pageNum }, "bookshelf-scanner: reading page");

      const screenshotPath = path.join(
        SCREENSHOT_DIR,
        `bookshelf-p${pageNum}-${Date.now()}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const extraction = await extractPageData(screenshotPath);
      allEntries.push(...extraction.titles);

      logger.info(
        { pageNum, foundOnPage: extraction.titles.length, hasNextPage: extraction.hasNextPage },
        "bookshelf-scanner: page extracted",
      );

      if (extraction.hasNextPage) {
        // Try several selectors for the KDP pagination "Next" button
        const nextSelectors = [
          'button:has-text("Next")',
          'a:has-text("Next")',
          '[aria-label="Next page"]',
          '[aria-label="Go to next page"]',
          'li.a-last a',
          '.a-pagination .a-last a',
        ];

        let clicked = false;
        for (const sel of nextSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 })) {
              await btn.click();
              await page.waitForTimeout(2500);
              clicked = true;
              break;
            }
          } catch {
            // selector not found — try next
          }
        }

        if (!clicked) {
          logger.info("bookshelf-scanner: Claude reported next page but no clickable button found — stopping");
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }
  } finally {
    await page.close();
  }

  // ─── Match KDP entries to DB books and update ────────────────────────────────

  const dbBooks = await db.select().from(booksTable);
  let updated = 0;

  for (const entry of allEntries) {
    const match = dbBooks.find((b) => titlesMatch(b.title, entry.kdpTitle));
    if (!match) {
      logger.info({ kdpTitle: entry.kdpTitle }, "bookshelf-scanner: no DB match — title may be new or from another account");
      continue;
    }

    // Determine new overall book status
    const allLive =
      entry.ebookStatus === "live" &&
      entry.paperbackStatus === "live" &&
      entry.hardcoverStatus === "live";

    const anyLive =
      entry.ebookStatus === "live" ||
      entry.paperbackStatus === "live" ||
      entry.hardcoverStatus === "live";

    const anyInProgress =
      entry.ebookStatus === "in_review" ||
      entry.ebookStatus === "publishing" ||
      entry.paperbackStatus === "in_review" ||
      entry.paperbackStatus === "publishing" ||
      entry.hardcoverStatus === "in_review" ||
      entry.hardcoverStatus === "publishing";

    let newStatus: string = match.status;
    if (allLive) {
      newStatus = "live";
    } else if (anyLive || anyInProgress) {
      newStatus = "partial";
    }

    await db
      .update(booksTable)
      .set({
        ebookKdpStatus: entry.ebookStatus,
        paperbackKdpStatus: entry.paperbackStatus,
        hardcoverKdpStatus: entry.hardcoverStatus,
        lastBookshelfScanAt: new Date(),
        status: newStatus,
      })
      .where(eq(booksTable.id, match.id));

    updated++;
    logger.info(
      {
        title: match.title,
        ebook: entry.ebookStatus,
        paperback: entry.paperbackStatus,
        hardcover: entry.hardcoverStatus,
        newStatus,
      },
      "bookshelf-scanner: book updated",
    );
  }

  const message =
    allEntries.length === 0
      ? "No titles found — is the KDP browser session logged in?"
      : `Scanned ${allEntries.length} KDP title(s) across ${pageNum} page(s), updated ${updated} book(s) in the catalog`;

  logger.info({ scanned: allEntries.length, updated }, "KDP bookshelf scan complete");

  return { scanned: allEntries.length, updated, message };
}
