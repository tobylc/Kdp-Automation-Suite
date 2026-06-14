/**
 * KDP Bookshelf Scanner
 *
 * Uses the shared Playwright browser (inheriting the live KDP session) to navigate
 * the Amazon KDP bookshelf and extract per-format status for every title using
 * direct DOM scraping — no AI credits required.
 */

import { getBrowser } from "./agent-runner";
import { db, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { Page } from "playwright";

const KDP_BOOKSHELF_URL = "https://kdp.amazon.com/en_US/bookshelf";

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

function titlesMatch(dbTitle: string, kdpTitle: string): boolean {
  const db = normalizeTitle(dbTitle);
  const kdp = normalizeTitle(kdpTitle);
  if (db === kdp) return true;
  if (kdp.startsWith(db + ":") || kdp.startsWith(db + " -")) return true;
  return kdp.includes(db);
}

// ─── DOM-based extraction (no AI credits needed) ──────────────────────────────

async function extractPageDataFromDom(page: Page): Promise<PageExtraction> {
  const result = await page.evaluate((): { titles: Array<{
    kdpTitle: string;
    ebookStatus: string;
    paperbackStatus: string;
    hardcoverStatus: string;
  }>; hasNextPage: boolean } => {

    function normalizeStatus(text: string): string {
      const t = (text || "").toLowerCase().trim();
      if (t.includes("live")) return "live";
      if (t.includes("in review") || t.includes("under review") || t.includes("submitted")) return "in_review";
      if (t.includes("publishing")) return "publishing";
      if (t.includes("draft") || t.includes("not published")) return "draft";
      if (t.includes("blocked")) return "blocked";
      return "not_created";
    }

    function cleanText(el: Element | null | undefined): string {
      return (el?.textContent || "").replace(/\s+/g, " ").trim();
    }

    const titles: Array<{
      kdpTitle: string;
      ebookStatus: string;
      paperbackStatus: string;
      hardcoverStatus: string;
    }> = [];

    // ── Strategy 1: KDP shelf rows via data attributes ──────────────────────
    // KDP uses rows with data-testid or specific ARIA roles
    const shelfRows = Array.from(document.querySelectorAll(
      '[data-testid*="book"], [data-id*="book"], .shelf-title-item, [class*="shelfTitleItem"], [class*="shelf-title"]'
    ));

    for (const row of shelfRows) {
      const text = row.textContent || "";
      if (!text.includes("Kindle") && !text.includes("Paperback") && !text.includes("Hardcover")) continue;

      const titleEl = row.querySelector('h2, h3, [class*="title"], [class*="bookTitle"], [class*="book-title"], a[href*="title_id"]');
      const kdpTitle = cleanText(titleEl);
      if (!kdpTitle || kdpTitle.length < 3) continue;

      const kindleIdx = text.indexOf("Kindle");
      const pbIdx = text.indexOf("Paperback");
      const hcIdx = text.indexOf("Hardcover");

      const getSection = (start: number, end: number) =>
        start >= 0 ? text.slice(start, end > start ? end : start + 300) : "";

      const kindleSection = getSection(kindleIdx, Math.min(...[pbIdx, hcIdx].filter(x => x > kindleIdx && x !== -1), text.length));
      const pbSection = getSection(pbIdx, hcIdx > pbIdx && hcIdx !== -1 ? hcIdx : pbIdx + 300);
      const hcSection = getSection(hcIdx, text.length);

      titles.push({
        kdpTitle,
        ebookStatus: normalizeStatus(kindleSection),
        paperbackStatus: normalizeStatus(pbSection),
        hardcoverStatus: normalizeStatus(hcSection),
      });
    }

    if (titles.length > 0) {
      const nextDisabled = document.querySelector('li.a-last.a-disabled, [aria-label="Go to next page"][disabled]');
      const nextEnabled = document.querySelector('li.a-last:not(.a-disabled) a, [aria-label="Go to next page"]:not([disabled])');
      return { titles, hasNextPage: !nextDisabled && !!nextEnabled };
    }

    // ── Strategy 2: find smallest containers with all 3 format labels ────────
    const allEls = Array.from(document.querySelectorAll("div, li, section, article, tr"));

    // Find elements containing at least "Kindle" AND one of PB/HC
    const candidates = allEls.filter(el => {
      const t = el.textContent || "";
      return (
        t.includes("Kindle") &&
        (t.includes("Paperback") || t.includes("Hardcover")) &&
        el.children.length >= 2 &&
        el.children.length <= 40
      );
    });

    // Sort by text length ascending (smallest = most specific)
    candidates.sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0));

    // Filter to leaf-like containers (no candidate is a descendant of another found candidate)
    const leafRows: Element[] = [];
    for (const el of candidates) {
      const alreadyCovered = leafRows.some(r => r.contains(el));
      if (!alreadyCovered) leafRows.push(el);
    }

    for (const row of leafRows) {
      const text = row.textContent || "";

      // Find title — prefer heading/link, else first substantial line before "Kindle"
      const titleEl = row.querySelector('h2, h3, h4, [class*="title" i], [class*="name" i], a[href*="title"]');
      let kdpTitle = cleanText(titleEl);

      if (!kdpTitle || kdpTitle.length < 3) {
        // Fallback: text before the first format keyword
        const beforeFormat = text.split(/Kindle|Paperback|Hardcover/)[0];
        const lines = beforeFormat.split("\n").map(l => l.trim()).filter(l => l.length > 3);
        kdpTitle = lines[lines.length - 1] || "";
      }

      if (!kdpTitle || kdpTitle.length < 3) continue;
      // Skip if title looks like a nav/button label
      if (/^(sign in|help|reports|community|bookshelf|marketing)/i.test(kdpTitle)) continue;

      const kindleIdx = text.indexOf("Kindle");
      const pbIdx = text.indexOf("Paperback");
      const hcIdx = text.indexOf("Hardcover");

      const getSection = (start: number, end: number) =>
        start >= 0 ? text.slice(start, end > start ? end : start + 300) : "";

      const nextAfterKindle = [pbIdx, hcIdx].filter(x => x > kindleIdx && x !== -1);
      const kindleSection = getSection(kindleIdx, nextAfterKindle.length ? Math.min(...nextAfterKindle) : kindleIdx + 300);
      const pbSection = getSection(pbIdx, hcIdx > pbIdx && hcIdx !== -1 ? hcIdx : pbIdx + 300);
      const hcSection = getSection(hcIdx, text.length);

      titles.push({
        kdpTitle,
        ebookStatus: kindleIdx >= 0 ? normalizeStatus(kindleSection) : "not_created",
        paperbackStatus: pbIdx >= 0 ? normalizeStatus(pbSection) : "not_created",
        hardcoverStatus: hcIdx >= 0 ? normalizeStatus(hcSection) : "not_created",
      });
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    const nextDisabled = document.querySelector('li.a-last.a-disabled, [aria-label="Go to next page"][disabled]');
    const nextEnabled = document.querySelector('li.a-last:not(.a-disabled) a, [aria-label="Go to next page"]:not([disabled])');
    const hasNextPage = !nextDisabled && !!nextEnabled;

    return { titles, hasNextPage };
  });

  logger.info(
    { found: result.titles.length, hasNextPage: result.hasNextPage, titles: result.titles.map(t => t.kdpTitle) },
    "bookshelf-scanner: DOM extraction result"
  );

  return result as PageExtraction;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanKdpBookshelf(): Promise<BookshelfScanResult> {
  logger.info("KDP bookshelf scan started (DOM mode — no AI credits needed)");

  const { context } = await getBrowser();

  // Reuse the already-open KDP bookshelf tab if available
  const allPages = context.pages();
  const existingPage = allPages.find((p) => p.url().includes("kdp.amazon.com"));
  const page = existingPage ?? await context.newPage();

  const allEntries: KdpTitleEntry[] = [];
  let pageNum = 0;

  try {
    logger.info({ reusing: !!existingPage, url: page.url() }, "bookshelf-scanner: navigating to bookshelf");
    await page.goto(KDP_BOOKSHELF_URL, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(3000);

    let hasMorePages = true;

    while (hasMorePages) {
      pageNum++;
      logger.info({ pageNum }, "bookshelf-scanner: reading page");

      const extraction = await extractPageDataFromDom(page);
      allEntries.push(...extraction.titles);

      logger.info(
        { pageNum, foundOnPage: extraction.titles.length, hasNextPage: extraction.hasNextPage },
        "bookshelf-scanner: page extracted",
      );

      if (extraction.hasNextPage) {
        const nextSelectors = [
          'li.a-last:not(.a-disabled) a',
          '.a-pagination .a-last a',
          'button:has-text("Next")',
          'a:has-text("Next")',
          '[aria-label="Next page"]',
          '[aria-label="Go to next page"]',
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
          logger.info("bookshelf-scanner: next page reported but no button found — stopping");
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }
  } finally {
    // Only close the page if we opened a new one
    if (!existingPage) {
      await page.close();
    }
  }

  // ─── Match KDP entries to DB books and update ────────────────────────────────

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
      ? "No titles found on KDP bookshelf — check that Chrome is open and logged into KDP"
      : `Scanned ${allEntries.length} KDP title(s) across ${pageNum} page(s), updated ${updated} book(s) in the catalog`;

  logger.info({ scanned: allEntries.length, updated }, "KDP bookshelf scan complete");

  return { scanned: allEntries.length, updated, message };
}
