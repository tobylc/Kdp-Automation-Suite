/**
 * KDP Bookshelf Scanner
 *
 * Uses AI vision (screenshot → Claude) to extract per-format status for every
 * title on the KDP bookshelf. Pagination is handled by extracting the "Next"
 * link href from the DOM and navigating directly — no button-click guessing.
 */

import { getBrowser } from "./agent-runner";
import { askAi } from "./ai-provider";
import { db, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { Page } from "playwright";

const KDP_BOOKSHELF_URL = "https://kdp.amazon.com/en_US/bookshelf";
const MAX_PAGES = 50;

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

function titlesMatch(dbTitle: string, kdpTitle: string): boolean {
  const a = normalizeTitle(dbTitle);
  const b = normalizeTitle(kdpTitle);
  if (a === b) return true;
  if (b.startsWith(a + ":") || b.startsWith(a + " -")) return true;
  return b.includes(a) || a.includes(b);
}

// ─── AI vision extraction ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a JSON extraction assistant for Amazon KDP bookshelf pages.
Your job is to read a screenshot of the KDP bookshelf and return structured data.
Always respond with ONLY valid JSON — no markdown, no explanation, no code fences.`;

const USER_PROMPT = `Look at this Amazon KDP bookshelf screenshot and extract every book title visible on this page along with the upload status of each format.

For each book return:
- "title": the exact book title as shown
- "ebook": status of the Kindle eBook format
- "paperback": status of the Paperback format  
- "hardcover": status of the Hardcover format

Valid status values: "live", "in_review", "publishing", "draft", "not_created"
- Use "live" if you see "Live" badge
- Use "in_review" if you see "In Review", "Under Review", or "Submitted"
- Use "publishing" if you see "Publishing"
- Use "draft" if you see "Draft" or "Not Published"
- Use "not_created" if that format has no row or shows "+" / "Create"

Return JSON in this exact shape:
{
  "books": [
    {
      "title": "Book Title Here",
      "ebook": "live",
      "paperback": "draft",
      "hardcover": "not_created"
    }
  ]
}`;

interface AiPageResult {
  books: Array<{
    title: string;
    ebook: string;
    paperback: string;
    hardcover: string;
  }>;
}

function parseStatus(s: string): KdpFormatStatus {
  const t = (s || "").toLowerCase().trim();
  if (t === "live") return "live";
  if (t === "in_review") return "in_review";
  if (t === "publishing") return "publishing";
  if (t === "draft") return "draft";
  if (t === "blocked") return "blocked";
  return "not_created";
}

async function extractPageWithAI(page: Page): Promise<KdpTitleEntry[]> {
  // Full-page screenshot → base64
  const buf = await page.screenshot({ fullPage: true, type: "png" });
  const base64 = buf.toString("base64");

  const raw = await askAi(base64, SYSTEM_PROMPT, USER_PROMPT);

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  let parsed: AiPageResult;
  try {
    parsed = JSON.parse(cleaned) as AiPageResult;
  } catch (err) {
    logger.warn({ raw, err }, "bookshelf-scanner: AI response was not valid JSON");
    return [];
  }

  if (!Array.isArray(parsed.books)) {
    logger.warn({ parsed }, "bookshelf-scanner: AI response missing 'books' array");
    return [];
  }

  return parsed.books.map((b) => ({
    kdpTitle: (b.title || "").trim(),
    ebookStatus: parseStatus(b.ebook),
    paperbackStatus: parseStatus(b.paperback),
    hardcoverStatus: parseStatus(b.hardcover),
  })).filter((e) => e.kdpTitle.length > 2);
}

// ─── Pagination: extract the Next link href directly, then goto() it ──────────

async function getNextPageUrl(page: Page): Promise<string | null> {
  return page.evaluate((): string | null => {
    // Strategy 1: Amazon standard .a-pagination — the last <li> holds the Next link
    const paginationLastLi = document.querySelector(
      "ul.a-pagination li.a-last, .a-pagination li.a-last"
    );
    if (paginationLastLi) {
      // If the li has the a-disabled class there is no next page
      if (paginationLastLi.classList.contains("a-disabled")) return null;
      const a = paginationLastLi.querySelector("a");
      if (a) return (a as HTMLAnchorElement).href;
    }

    // Strategy 2: aria-label
    const ariaNext = document.querySelector<HTMLAnchorElement>(
      'a[aria-label="Go to next page"], a[aria-label="Next page"]'
    );
    if (ariaNext && !ariaNext.closest(".a-disabled") && !ariaNext.hasAttribute("disabled")) {
      return ariaNext.href;
    }

    // Strategy 3: any visible link whose trimmed text is exactly "Next"
    const allLinks = Array.from(document.querySelectorAll("a"));
    for (const link of allLinks) {
      const t = (link.textContent || "").trim().toLowerCase();
      if ((t === "next" || t === "next page") &&
          !link.closest(".a-disabled") &&
          !link.hasAttribute("disabled")) {
        return (link as HTMLAnchorElement).href;
      }
    }

    return null;
  });
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanKdpBookshelf(): Promise<BookshelfScanResult> {
  logger.info("KDP bookshelf scan started (AI vision mode)");

  const { context } = await getBrowser();
  const allPages = context.pages();
  const existingPage = allPages.find((p) => p.url().includes("kdp.amazon.com"));
  const page = existingPage ?? await context.newPage();

  const allEntries: KdpTitleEntry[] = [];
  let pageNum = 0;
  const seenUrls = new Set<string>();

  try {
    logger.info({ reusing: !!existingPage }, "bookshelf-scanner: navigating to bookshelf");
    await page.goto(KDP_BOOKSHELF_URL, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);

    while (pageNum < MAX_PAGES) {
      pageNum++;
      const currentUrl = page.url();

      // Guard against revisiting the same URL
      if (seenUrls.has(currentUrl)) {
        logger.warn({ pageNum, currentUrl }, "bookshelf-scanner: revisited URL — stopping");
        break;
      }
      seenUrls.add(currentUrl);

      logger.info({ pageNum, url: currentUrl }, "bookshelf-scanner: scanning page with AI");

      const entries = await extractPageWithAI(page);
      logger.info(
        { pageNum, found: entries.length, titles: entries.map((e) => e.kdpTitle) },
        "bookshelf-scanner: AI extraction result",
      );
      allEntries.push(...entries);

      // Get next page URL directly from DOM (no clicking needed)
      const nextUrl = await getNextPageUrl(page);
      logger.info({ pageNum, nextUrl }, "bookshelf-scanner: next page URL");

      if (!nextUrl) {
        logger.info({ pageNum }, "bookshelf-scanner: no next page — scan complete");
        break;
      }

      // Navigate directly — much more reliable than clicking
      await page.goto(nextUrl, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(1500);
    }

    if (pageNum >= MAX_PAGES) {
      logger.warn({ MAX_PAGES }, "bookshelf-scanner: hit max page cap");
    }

  } finally {
    if (!existingPage) {
      await page.close();
    }
  }

  // ─── Match to DB books and update ─────────────────────────────────────────

  const dbBooks = await db.select().from(booksTable);
  let updated = 0;

  for (const entry of allEntries) {
    const match = dbBooks.find((b) => titlesMatch(b.title, entry.kdpTitle));
    if (!match) {
      logger.info({ kdpTitle: entry.kdpTitle }, "bookshelf-scanner: no DB match — skipping");
      continue;
    }

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
    if (allLive) newStatus = "live";
    else if (anyLive || anyInProgress) newStatus = "partial";

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
      { title: match.title, ebook: entry.ebookStatus, paperback: entry.paperbackStatus, hardcover: entry.hardcoverStatus, newStatus },
      "bookshelf-scanner: book updated",
    );
  }

  const message =
    allEntries.length === 0
      ? "No titles found — check Chrome is open and logged into KDP, and your AI provider is configured"
      : `Scanned ${allEntries.length} KDP title(s) across ${pageNum} page(s), updated ${updated} book(s) in the catalog`;

  logger.info({ scanned: allEntries.length, updated, pages: pageNum }, "KDP bookshelf scan complete");
  return { scanned: allEntries.length, updated, message };
}
