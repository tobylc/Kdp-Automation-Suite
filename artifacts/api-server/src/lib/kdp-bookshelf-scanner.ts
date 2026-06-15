/**
 * KDP Bookshelf Scanner
 *
 * Uses DOM scraping for title/status extraction and content-fingerprint
 * detection for pagination — handles KDP's AJAX-based page loading where
 * clicking Next updates content without changing the URL.
 */

import { getBrowser } from "./agent-runner";
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

// ─── DOM extraction ────────────────────────────────────────────────────────────

const UI_SKIP = new Set([
  "manage title", "edit", "promote and advertise", "add format",
  "preview", "unpublish", "kindle ebook", "paperback", "hardcover",
  "bulk update tool", "next", "previous", "kindle direct publishing",
  "sign in", "help", "reports", "community", "bookshelf", "marketing",
]);

function isUiLabel(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.length < 3 ||
    UI_SKIP.has(t) ||
    /^books? in /i.test(t) ||
    /^(live|draft|in review|publishing|blocked)$/i.test(t)
  );
}

async function extractTitlesFromDom(page: Page): Promise<KdpTitleEntry[]> {
  const result = await page.evaluate((): Array<{
    kdpTitle: string;
    ebookStatus: string;
    paperbackStatus: string;
    hardcoverStatus: string;
  }> => {
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

    const UI = new Set([
      "manage title", "edit", "promote and advertise", "add format",
      "preview", "unpublish", "kindle ebook", "paperback", "hardcover",
      "bulk update tool", "next", "previous", "kindle direct publishing",
    ]);

    function isUi(text: string): boolean {
      const t = text.toLowerCase().trim();
      return t.length < 3 || UI.has(t) || /^books? in /i.test(t) ||
        /^(live|draft|in review|publishing|blocked)$/i.test(t);
    }

    const titles: Array<{ kdpTitle: string; ebookStatus: string; paperbackStatus: string; hardcoverStatus: string }> = [];

    // Walk up from "Manage title" links to find book card containers
    const manageTitleLinks = Array.from(document.querySelectorAll("a, button")).filter(
      el => el.textContent?.trim().toLowerCase() === "manage title"
    );

    const bookContainers = new Set<Element>();
    for (const link of manageTitleLinks) {
      let el: Element | null = link.parentElement;
      while (el && el !== document.body) {
        const t = el.textContent || "";
        const formatsFound = [t.includes("Kindle"), t.includes("Paperback"), t.includes("Hardcover")].filter(Boolean).length;
        if (formatsFound >= 2) { bookContainers.add(el); break; }
        el = el.parentElement;
      }
    }

    // Keep only leaf containers (smallest — no container is an ancestor of another)
    const leafContainers: Element[] = [];
    for (const c of bookContainers) {
      const alreadyCovered = leafContainers.some(r => r.contains(c));
      if (!alreadyCovered) {
        for (let i = leafContainers.length - 1; i >= 0; i--) {
          if (c.contains(leafContainers[i])) leafContainers.splice(i, 1);
        }
        leafContainers.push(c);
      }
    }

    for (const container of leafContainers) {
      const text = container.textContent || "";

      // Find title from headings/named elements (not a[href*=title] — matches "Manage title")
      let kdpTitle = "";
      const candidates = Array.from(container.querySelectorAll(
        'h1, h2, h3, h4, [class*="title" i], [class*="name" i], [class*="heading" i]'
      ));
      for (const el of candidates) {
        const t = cleanText(el);
        if (t && !isUi(t) && t.length >= 4) { kdpTitle = t; break; }
      }

      // Fallback: first non-UI text chunk before format keywords
      if (!kdpTitle) {
        const beforeFormat = text.split(/Kindle|Paperback|Hardcover/)[0];
        const lines = beforeFormat.split(/[\n\r|•]/).map(l => l.replace(/\s+/g, " ").trim()).filter(l => l.length >= 4 && !isUi(l));
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

    return titles;
  });

  return result.map(r => ({
    kdpTitle: r.kdpTitle,
    ebookStatus: r.ebookStatus as KdpFormatStatus,
    paperbackStatus: r.paperbackStatus as KdpFormatStatus,
    hardcoverStatus: r.hardcoverStatus as KdpFormatStatus,
  }));
}

// ─── Page fingerprint — detects when AJAX pagination loads new content ─────────

async function getPageFingerprint(page: Page): Promise<string> {
  return page.evaluate((): string => {
    // Capture the first few book titles visible — changes when Next is clicked
    const links = Array.from(document.querySelectorAll("a, button")).filter(
      el => el.textContent?.trim().toLowerCase() === "manage title"
    );
    // Walk up to find containers and grab their first heading-like text
    const snippets: string[] = [];
    for (const link of links.slice(0, 3)) {
      let el: Element | null = link.parentElement;
      while (el && el !== document.body) {
        const t = el.textContent || "";
        if (t.includes("Kindle") || t.includes("Paperback")) {
          const heading = el.querySelector("h1,h2,h3,h4,[class*=title i]");
          if (heading?.textContent) { snippets.push(heading.textContent.trim().slice(0, 60)); break; }
        }
        el = el.parentElement;
      }
    }
    return snippets.join("||") || document.title;
  });
}

// ─── Click Next and wait for content to change ─────────────────────────────────

async function clickNextAndWait(page: Page): Promise<boolean> {
  const beforeFingerprint = await getPageFingerprint(page);

  // Try each Next-button selector
  const selectors = [
    'ul.a-pagination li.a-last:not(.a-disabled) a',
    '.a-pagination li.a-last:not(.a-disabled) a',
    'a[aria-label="Go to next page"]',
    'a[aria-label="Next page"]',
    'button[aria-label="Go to next page"]',
    'a:has-text("Next")',
    'button:has-text("Next")',
  ];

  // Also try extracting href and navigating directly (for href-based pagination)
  const nextHref = await page.evaluate((): string | null => {
    const lastLi = document.querySelector("ul.a-pagination li.a-last, .a-pagination li.a-last");
    if (lastLi && !lastLi.classList.contains("a-disabled")) {
      const a = lastLi.querySelector("a");
      if (a) return (a as HTMLAnchorElement).href;
    }
    const ariaNext = document.querySelector<HTMLAnchorElement>('a[aria-label="Go to next page"], a[aria-label="Next page"]');
    if (ariaNext && !ariaNext.closest(".a-disabled")) return ariaNext.href;
    const allLinks = Array.from(document.querySelectorAll("a"));
    for (const link of allLinks) {
      const t = (link.textContent || "").trim().toLowerCase();
      if ((t === "next" || t === "next page") && !link.closest(".a-disabled")) {
        return (link as HTMLAnchorElement).href;
      }
    }
    return null;
  });

  if (nextHref && nextHref !== page.url()) {
    // URL-based pagination — navigate directly
    logger.info({ nextHref }, "bookshelf-scanner: navigating to next page via href");
    await page.goto(nextHref, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);
    return true;
  }

  // AJAX-based pagination — click and wait for content to change
  let clicked = false;
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (!await btn.isVisible({ timeout: 1500 })) continue;

      const isDisabled = await btn.evaluate((el) => {
        let node: Element | null = el;
        while (node) {
          if (node.classList.contains("a-disabled") || node.getAttribute("disabled") !== null) return true;
          node = node.parentElement;
        }
        return false;
      });
      if (isDisabled) continue;

      logger.info({ selector: sel }, "bookshelf-scanner: clicking next page");
      await btn.click();
      clicked = true;
      break;
    } catch { /* try next */ }
  }

  if (!clicked) {
    logger.info("bookshelf-scanner: no Next button found — last page");
    return false;
  }

  // Wait up to 8 seconds for the content to change (AJAX pagination)
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    const afterFingerprint = await getPageFingerprint(page);
    if (afterFingerprint !== beforeFingerprint) {
      logger.info({ attempts: i + 1 }, "bookshelf-scanner: content changed after Next click");
      return true;
    }
  }

  logger.warn("bookshelf-scanner: content unchanged after 8s — assuming last page");
  return false;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanKdpBookshelf(): Promise<BookshelfScanResult> {
  logger.info("KDP bookshelf scan started");

  const { context } = await getBrowser();
  const allPages = context.pages();
  const existingPage = allPages.find((p) => p.url().includes("kdp.amazon.com"));
  const page = existingPage ?? await context.newPage();

  const allEntries: KdpTitleEntry[] = [];
  let pageNum = 0;

  try {
    logger.info({ reusing: !!existingPage }, "bookshelf-scanner: navigating to bookshelf");
    await page.goto(KDP_BOOKSHELF_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    while (pageNum < MAX_PAGES) {
      pageNum++;
      logger.info({ pageNum, url: page.url() }, "bookshelf-scanner: scanning page");

      const entries = await extractTitlesFromDom(page);
      logger.info({ pageNum, found: entries.length, titles: entries.map(e => e.kdpTitle) }, "bookshelf-scanner: page titles");
      allEntries.push(...entries);

      const hasMore = await clickNextAndWait(page);
      if (!hasMore) break;
    }

    if (pageNum >= MAX_PAGES) logger.warn({ MAX_PAGES }, "bookshelf-scanner: hit page cap");

  } finally {
    if (!existingPage) await page.close();
  }

  // ─── Match to DB and update ───────────────────────────────────────────────

  const dbBooks = await db.select().from(booksTable);
  let updated = 0;

  for (const entry of allEntries) {
    const match = dbBooks.find(b => titlesMatch(b.title, entry.kdpTitle));
    if (!match) {
      logger.info({ kdpTitle: entry.kdpTitle }, "bookshelf-scanner: no DB match — skipping");
      continue;
    }

    const allLive = entry.ebookStatus === "live" && entry.paperbackStatus === "live" && entry.hardcoverStatus === "live";
    const anyLive = entry.ebookStatus === "live" || entry.paperbackStatus === "live" || entry.hardcoverStatus === "live";
    const anyInProgress = ["in_review","publishing"].includes(entry.ebookStatus) ||
      ["in_review","publishing"].includes(entry.paperbackStatus) ||
      ["in_review","publishing"].includes(entry.hardcoverStatus);

    let newStatus: string = match.status;
    if (allLive) newStatus = "live";
    else if (anyLive || anyInProgress) newStatus = "partial";

    await db.update(booksTable).set({
      ebookKdpStatus: entry.ebookStatus,
      paperbackKdpStatus: entry.paperbackStatus,
      hardcoverKdpStatus: entry.hardcoverStatus,
      lastBookshelfScanAt: new Date(),
      status: newStatus,
    }).where(eq(booksTable.id, match.id));

    updated++;
    logger.info({ title: match.title, ebook: entry.ebookStatus, paperback: entry.paperbackStatus, hardcover: entry.hardcoverStatus, newStatus }, "bookshelf-scanner: book updated");
  }

  const message = allEntries.length === 0
    ? "No titles found — check Chrome is open and logged into KDP"
    : `Scanned ${allEntries.length} KDP title(s) across ${pageNum} page(s), updated ${updated} book(s) in the catalog`;

  logger.info({ scanned: allEntries.length, updated, pages: pageNum }, "KDP bookshelf scan complete");
  return { scanned: allEntries.length, updated, message };
}
