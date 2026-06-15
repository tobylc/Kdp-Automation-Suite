/**
 * KDP Bookshelf Scanner
 *
 * Uses DOM scraping for title/status extraction and content-fingerprint
 * detection for pagination — handles KDP's AJAX-based page loading where
 * clicking Next updates content without changing the URL.
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
    const links = Array.from(document.querySelectorAll("a, button")).filter(
      el => el.textContent?.trim().toLowerCase() === "manage title"
    );
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

// ─── CUA vision: ask AI to locate and click the Next page button ──────────────
//
// Uses whatever AI provider is configured in the app (Anthropic, OpenRouter,
// OpenAI, etc.) via askAi() — no provider hard-coding here.

async function clickNextWithCua(page: Page): Promise<boolean> {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  const base64 = buf.toString("base64");

  const system = `You are a browser automation assistant. Look at this screenshot of the Amazon KDP bookshelf page.
Your ONLY job is to locate a clickable "Next page" or "Next" pagination button.
Respond with EXACTLY one of:
  CLICK:x,y   — if a Next page button is visible and NOT greyed out/disabled (x,y = pixel coordinates to click)
  NO_NEXT     — if there is no Next button, or it is greyed out / disabled / on the last page
No other text. No explanation.`;

  const userMsg = "Is there a clickable Next page button? If yes, give me the pixel coordinates. If no or disabled, say NO_NEXT.";

  let response: string;
  try {
    response = (await askAi(base64, system, userMsg)).trim();
  } catch (err) {
    logger.warn({ err }, "bookshelf-scanner: CUA vision call failed — treating as last page");
    return false;
  }

  logger.info({ response }, "bookshelf-scanner: CUA pagination response");

  if (!response.startsWith("CLICK:")) return false;

  const coords = response.replace("CLICK:", "").split(",");
  const x = parseInt(coords[0]?.trim(), 10);
  const y = parseInt(coords[1]?.trim(), 10);

  if (isNaN(x) || isNaN(y)) {
    logger.warn({ response }, "bookshelf-scanner: CUA gave invalid coordinates");
    return false;
  }

  const beforeFingerprint = await getPageFingerprint(page);
  logger.info({ x, y }, "bookshelf-scanner: CUA clicking Next at coordinates");
  await page.mouse.click(x, y);

  // Wait up to 8s for content to change (AJAX pagination)
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    const afterFingerprint = await getPageFingerprint(page);
    if (afterFingerprint !== beforeFingerprint) {
      logger.info({ attempts: i + 1 }, "bookshelf-scanner: content changed after CUA click");
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

      const hasMore = await clickNextWithCua(page);
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
