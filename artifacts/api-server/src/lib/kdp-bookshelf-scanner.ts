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
const MAX_PAGES = 10; // hard cap to prevent infinite loops

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
  debugH2s?: string[];
  debugH3s?: string[];
  paginationHtml?: string;
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
  return kdp.includes(db) || db.includes(kdp);
}

// Known KDP UI strings that are never real book titles
const UI_STRINGS = new Set([
  "manage title", "edit", "promote and advertise", "add format",
  "preview", "unpublish", "sign in", "help", "reports", "community",
  "bookshelf", "marketing", "bulk update tool", "next", "previous",
  "kindle ebook", "paperback", "hardcover", "kindle direct publishing",
]);

function isUiLabel(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.length < 3 ||
    UI_STRINGS.has(t) ||
    /^(sign in|help|reports|community|bookshelf|marketing)/i.test(t) ||
    /^book in /i.test(t) ||             // KDP section headers like "Book in The Reflective Reader"
    /^books in /i.test(t) ||
    /^(live|draft|in review|publishing|blocked)$/i.test(t)
  );
}

// ─── DOM-based extraction ──────────────────────────────────────────────────────

async function extractPageDataFromDom(page: Page): Promise<PageExtraction> {
  const result = await page.evaluate(() => {
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

    const UI_SKIP = new Set([
      "manage title", "edit", "promote and advertise", "add format",
      "preview", "unpublish", "kindle ebook", "paperback", "hardcover",
      "bulk update tool", "next", "previous", "kindle direct publishing",
    ]);

    function isUi(text: string): boolean {
      const t = text.toLowerCase().trim();
      return (
        t.length < 3 ||
        UI_SKIP.has(t) ||
        /^(sign in|help|reports|community|bookshelf|marketing)/i.test(t) ||
        /^books? in /i.test(t) ||
        /^(live|draft|in review|publishing|blocked)$/i.test(t)
      );
    }

    const titles: Array<{
      kdpTitle: string;
      ebookStatus: string;
      paperbackStatus: string;
      hardcoverStatus: string;
    }> = [];

    // ── Debug: capture all headings to help diagnose structure ────────────────
    const h2s = Array.from(document.querySelectorAll("h2"))
      .map(el => el.textContent?.trim() || "")
      .filter(t => t.length > 2)
      .slice(0, 30);

    const h3s = Array.from(document.querySelectorAll("h3"))
      .map(el => el.textContent?.trim() || "")
      .filter(t => t.length > 2)
      .slice(0, 30);

    // ── Strategy 1: KDP shelf rows via data attributes ────────────────────────
    const shelfRows = Array.from(document.querySelectorAll(
      '[data-testid*="book"], [data-id*="book"], .shelf-title-item, [class*="shelfTitleItem"], [class*="shelf-title"]'
    ));

    for (const row of shelfRows) {
      const text = row.textContent || "";
      if (!text.includes("Kindle") && !text.includes("Paperback") && !text.includes("Hardcover")) continue;

      // NOTE: Do NOT use a[href*="title"] — it matches "Manage title" links
      const titleEl = row.querySelector('h2, h3, [class*="bookTitle"], [class*="book-title"], [class*="title-name"]');
      const kdpTitle = cleanText(titleEl);
      if (!kdpTitle || isUi(kdpTitle)) continue;

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
        ebookStatus: kindleIdx >= 0 ? normalizeStatus(kindleSection) : "not_created",
        paperbackStatus: pbIdx >= 0 ? normalizeStatus(pbSection) : "not_created",
        hardcoverStatus: hcIdx >= 0 ? normalizeStatus(hcSection) : "not_created",
      });
    }

    // ── Strategy 2: Walk up from "Manage title" anchor links ─────────────────
    // "Manage title" buttons are reliable per-format anchors on every KDP book card
    if (titles.length === 0) {
      // Collect all elements whose visible text is "Manage title"
      const manageTitleLinks = Array.from(document.querySelectorAll("a, button")).filter(
        el => el.textContent?.trim().toLowerCase() === "manage title"
      );

      // Walk up from each link to find the book-card container
      // (the smallest ancestor that contains Kindle/Paperback/Hardcover)
      const bookContainers = new Set<Element>();
      for (const link of manageTitleLinks) {
        let el: Element | null = link.parentElement;
        while (el && el !== document.body) {
          const t = el.textContent || "";
          const formatsFound = [
            t.includes("Kindle"), t.includes("Paperback"), t.includes("Hardcover")
          ].filter(Boolean).length;
          if (formatsFound >= 2) {
            bookContainers.add(el);
            break;
          }
          el = el.parentElement;
        }
      }

      // Deduplicate: keep only the SMALLEST containers (no container is an ancestor of another)
      const leafContainers: Element[] = [];
      for (const c of bookContainers) {
        const alreadyCovered = leafContainers.some(r => r.contains(c));
        if (!alreadyCovered) {
          // Remove any existing containers that this one contains
          for (let i = leafContainers.length - 1; i >= 0; i--) {
            if (c.contains(leafContainers[i])) leafContainers.splice(i, 1);
          }
          leafContainers.push(c);
        }
      }

      for (const container of leafContainers) {
        const text = container.textContent || "";

        // Find the title: prefer heading elements, avoid UI labels
        let kdpTitle = "";
        const candidates = Array.from(container.querySelectorAll(
          'h1, h2, h3, h4, [class*="title" i], [class*="name" i], [class*="heading" i]'
        ));

        for (const el of candidates) {
          const t = cleanText(el);
          if (t && !isUi(t) && t.length >= 4) {
            kdpTitle = t;
            break;
          }
        }

        // Fallback: first substantial text chunk before any format keyword
        if (!kdpTitle) {
          const beforeFormat = text.split(/Kindle|Paperback|Hardcover/)[0];
          const lines = beforeFormat
            .split(/[\n\r|•]/)
            .map(l => l.replace(/\s+/g, " ").trim())
            .filter(l => l.length >= 4 && !isUi(l));
          kdpTitle = lines[lines.length - 1] || "";
        }

        if (!kdpTitle || isUi(kdpTitle)) continue;

        const kindleIdx = text.indexOf("Kindle");
        const pbIdx = text.indexOf("Paperback");
        const hcIdx = text.indexOf("Hardcover");

        const getSection = (start: number, end: number) =>
          start >= 0 ? text.slice(start, end > start ? end : start + 400) : "";

        const nextAfterKindle = [pbIdx, hcIdx].filter(x => x > kindleIdx && x !== -1);
        const kindleSection = getSection(kindleIdx, nextAfterKindle.length ? Math.min(...nextAfterKindle) : kindleIdx + 400);
        const pbSection = getSection(pbIdx, hcIdx > pbIdx && hcIdx !== -1 ? hcIdx : pbIdx + 400);
        const hcSection = getSection(hcIdx, text.length);

        titles.push({
          kdpTitle,
          ebookStatus: kindleIdx >= 0 ? normalizeStatus(kindleSection) : "not_created",
          paperbackStatus: pbIdx >= 0 ? normalizeStatus(pbSection) : "not_created",
          hardcoverStatus: hcIdx >= 0 ? normalizeStatus(hcSection) : "not_created",
        });
      }
    }

    // ── Strategy 3: find leaf containers with 2+ format labels ───────────────
    if (titles.length === 0) {
      const allEls = Array.from(document.querySelectorAll("div, li, section, article, tr"));
      const candidates = allEls.filter(el => {
        const t = el.textContent || "";
        return (
          t.includes("Kindle") &&
          (t.includes("Paperback") || t.includes("Hardcover")) &&
          el.children.length >= 2 &&
          el.children.length <= 50
        );
      });

      candidates.sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0));

      const leafRows: Element[] = [];
      for (const el of candidates) {
        const alreadyCovered = leafRows.some(r => r.contains(el));
        if (!alreadyCovered) leafRows.push(el);
      }

      for (const row of leafRows) {
        const text = row.textContent || "";

        // NOTE: intentionally exclude a[href*="title"] — matches "Manage title" links
        const titleEl = row.querySelector('h2, h3, h4, [class*="title" i], [class*="name" i]');
        let kdpTitle = cleanText(titleEl);

        if (!kdpTitle || isUi(kdpTitle)) {
          const beforeFormat = text.split(/Kindle|Paperback|Hardcover/)[0];
          const lines = beforeFormat
            .split(/[\n\r|•]/)
            .map(l => l.replace(/\s+/g, " ").trim())
            .filter(l => l.length >= 4 && !isUi(l));
          kdpTitle = lines[lines.length - 1] || "";
        }

        if (!kdpTitle || isUi(kdpTitle)) continue;

        const kindleIdx = text.indexOf("Kindle");
        const pbIdx = text.indexOf("Paperback");
        const hcIdx = text.indexOf("Hardcover");

        const getSection = (start: number, end: number) =>
          start >= 0 ? text.slice(start, end > start ? end : start + 400) : "";

        const nextAfterKindle = [pbIdx, hcIdx].filter(x => x > kindleIdx && x !== -1);
        const kindleSection = getSection(kindleIdx, nextAfterKindle.length ? Math.min(...nextAfterKindle) : kindleIdx + 400);
        const pbSection = getSection(pbIdx, hcIdx > pbIdx && hcIdx !== -1 ? hcIdx : pbIdx + 400);
        const hcSection = getSection(hcIdx, text.length);

        titles.push({
          kdpTitle,
          ebookStatus: kindleIdx >= 0 ? normalizeStatus(kindleSection) : "not_created",
          paperbackStatus: pbIdx >= 0 ? normalizeStatus(pbSection) : "not_created",
          hardcoverStatus: hcIdx >= 0 ? normalizeStatus(hcSection) : "not_created",
        });
      }
    }

    // ── Pagination — multiple strategies ──────────────────────────────────────
    let hasNextPage = false;

    // Strategy A: Amazon standard .a-pagination component
    const aLastDisabled = document.querySelector(
      'li.a-last.a-disabled, .a-pagination .a-last.a-disabled'
    );
    const aLastEnabled = document.querySelector(
      'li.a-last:not(.a-disabled) a, .a-pagination .a-last:not(.a-disabled) a'
    );
    if (!aLastDisabled && aLastEnabled) hasNextPage = true;

    // Strategy B: aria-label based next button
    if (!hasNextPage) {
      const ariaNext = document.querySelector(
        '[aria-label="Go to next page"]:not([disabled]):not([aria-disabled="true"]), [aria-label="Next page"]:not([disabled])'
      );
      if (ariaNext) hasNextPage = true;
    }

    // Strategy C: any link/button whose visible text is "Next"
    if (!hasNextPage) {
      const allClickable = Array.from(document.querySelectorAll('a, button'));
      const nextBtn = allClickable.find(el => {
        const t = (el.textContent || "").trim().toLowerCase();
        return (t === "next" || t === "next page") &&
          !el.closest('.a-disabled, [disabled], [aria-disabled="true"]') &&
          !(el as HTMLAnchorElement | HTMLButtonElement).hasAttribute('disabled');
      });
      if (nextBtn) hasNextPage = true;
    }

    // Strategy D: compare current page number to max visible page number
    if (!hasNextPage) {
      const selectedPage = document.querySelector('.a-pagination .a-selected, .a-pagination li.a-normal.a-selected');
      const currentPageNum = parseInt(selectedPage?.textContent?.trim() || "0", 10);
      if (currentPageNum > 0) {
        const allPageNums = Array.from(document.querySelectorAll('.a-pagination li a, .a-pagination li span'))
          .map(el => parseInt(el.textContent?.trim() || "", 10))
          .filter(n => !isNaN(n) && n > 0);
        if (allPageNums.some(n => n > currentPageNum)) hasNextPage = true;
      }
    }

    // Debug: capture what pagination elements exist
    const paginationHtml = document.querySelector('.a-pagination')?.outerHTML?.slice(0, 500) || "none found";

    return { titles, hasNextPage, debugH2s: h2s, debugH3s: h3s, paginationHtml };
  });

  logger.info(
    {
      found: result.titles.length,
      hasNextPage: result.hasNextPage,
      pagination: result.paginationHtml,
      titles: result.titles.map(t => t.kdpTitle),
    },
    "bookshelf-scanner: DOM extraction result"
  );

  // Log headings when no titles found — helps diagnose DOM structure changes
  if (result.titles.length === 0) {
    logger.warn(
      { h2s: result.debugH2s, h3s: result.debugH3s, pagination: result.paginationHtml },
      "bookshelf-scanner: no titles extracted — page heading dump for diagnosis"
    );
  }

  return result as PageExtraction;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanKdpBookshelf(): Promise<BookshelfScanResult> {
  logger.info("KDP bookshelf scan started (DOM mode — no AI credits needed)");

  const { context } = await getBrowser();

  const allPages = context.pages();
  const existingPage = allPages.find((p) => p.url().includes("kdp.amazon.com"));
  const page = existingPage ?? await context.newPage();

  const allEntries: KdpTitleEntry[] = [];
  let pageNum = 0;
  let lastUrl = "";

  try {
    logger.info({ reusing: !!existingPage, url: page.url() }, "bookshelf-scanner: navigating to bookshelf");
    await page.goto(KDP_BOOKSHELF_URL, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Pagination: drive entirely from Playwright locators — more reliable than DOM eval.
    // We don't rely on hasNextPage from the page; instead we probe for a clickable Next button.
    const nextButtonSelectors = [
      // Amazon standard pagination — the "last" li contains the Next link when not disabled
      'ul.a-pagination li.a-last:not(.a-disabled) a',
      '.a-pagination li.a-last:not(.a-disabled) a',
      // aria-label variants
      'a[aria-label="Go to next page"]',
      'a[aria-label="Next page"]',
      'button[aria-label="Go to next page"]',
      // text-based (Playwright partial text match)
      'a:has-text("Next")',
      'button:has-text("Next")',
    ];

    while (pageNum < MAX_PAGES) {
      pageNum++;
      const currentUrl = page.url();
      logger.info({ pageNum, url: currentUrl }, "bookshelf-scanner: reading page");

      const extraction = await extractPageDataFromDom(page);
      allEntries.push(...extraction.titles);

      logger.info(
        { pageNum, foundOnPage: extraction.titles.length, hasNextPage: extraction.hasNextPage, pagination: extraction.paginationHtml },
        "bookshelf-scanner: page extracted",
      );

      // Try each Next-button selector in order
      let clicked = false;
      for (const sel of nextButtonSelectors) {
        try {
          const btn = page.locator(sel).first();
          const visible = await btn.isVisible({ timeout: 1500 });
          if (!visible) continue;

          // Make sure it's not inside a disabled ancestor
          const isDisabled = await btn.evaluate((el) => {
            let node: Element | null = el;
            while (node) {
              if (
                node.classList.contains("a-disabled") ||
                node.getAttribute("disabled") !== null ||
                node.getAttribute("aria-disabled") === "true"
              ) return true;
              node = node.parentElement;
            }
            return false;
          });
          if (isDisabled) continue;

          logger.info({ selector: sel }, "bookshelf-scanner: clicking next page");
          await btn.click();
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1500);
          clicked = true;
          break;
        } catch {
          // selector not matched — try next
        }
      }

      if (!clicked) {
        logger.info({ pageNum }, "bookshelf-scanner: no Next button found — last page reached");
        break;
      }

      // Loop guard: stop if URL didn't change (JS pagination that failed)
      const newUrl = page.url();
      if (newUrl === currentUrl) {
        logger.warn({ pageNum }, "bookshelf-scanner: URL unchanged after Next click — stopping");
        break;
      }
      lastUrl = newUrl;
    }

    if (pageNum >= MAX_PAGES) {
      logger.warn({ MAX_PAGES }, "bookshelf-scanner: hit max page limit — stopping");
    }

  } finally {
    if (!existingPage) {
      await page.close();
    }
  }

  // ─── Match KDP entries to DB books and update ─────────────────────────────

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
      ? "No titles found on KDP bookshelf — check Chrome is open, logged into KDP, and on the bookshelf page. Check logs for heading dump to diagnose DOM structure."
      : `Scanned ${allEntries.length} KDP title(s) across ${pageNum} page(s), updated ${updated} book(s) in the catalog`;

  logger.info({ scanned: allEntries.length, updated }, "KDP bookshelf scan complete");

  return { scanned: allEntries.length, updated, message };
}
