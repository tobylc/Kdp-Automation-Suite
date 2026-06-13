import * as cheerio from "cheerio";
import { db, booksTable, uploadJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SOURCE_URL = "https://scripturemadesimple.replit.app/my-studies";

interface DiscoveredBook {
  title: string;
  sourceUrl: string;
  manuscriptUrl: string | null;
  coverJpgUrl: string | null;
  coverPngUrl: string | null;
  kdpContentUrl: string | null;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KDPUploader/1.0)",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

async function discoverBooks(): Promise<DiscoveredBook[]> {
  logger.info({ url: SOURCE_URL }, "Scanning for new books");
  const html = await fetchPage(SOURCE_URL);
  const $ = cheerio.load(html);
  const books: DiscoveredBook[] = [];

  // Look for book entries — each study/book section
  // Strategy: find headings or cards that represent individual book titles
  // and look for download links near them
  const baseUrl = SOURCE_URL;

  // Try to find book title containers with download links
  // Look for elements that contain both a title and download links
  const processed = new Set<string>();

  $("*").each((_i, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    // Find elements that look like book title containers
    // with sibling or child download links
    const links = $el.find("a[href]");
    if (links.length === 0) return;

    let manuscriptUrl: string | null = null;
    let coverJpgUrl: string | null = null;
    let coverPngUrl: string | null = null;
    let kdpContentUrl: string | null = null;
    let hasDownloads = false;

    links.each((_j, link) => {
      const href = $(link).attr("href") ?? "";
      const linkText = $(link).text().toLowerCase();
      const resolved = resolveUrl(baseUrl, href);

      if (
        linkText.includes("manuscript") ||
        href.toLowerCase().includes("manuscript") ||
        href.toLowerCase().includes(".pdf") ||
        linkText.includes("6x9") ||
        linkText.includes("interior")
      ) {
        manuscriptUrl = resolved;
        hasDownloads = true;
      } else if (
        href.toLowerCase().includes(".jpg") ||
        href.toLowerCase().includes(".jpeg") ||
        linkText.includes("cover") && href.toLowerCase().includes("jpg")
      ) {
        coverJpgUrl = resolved;
        hasDownloads = true;
      } else if (
        href.toLowerCase().includes(".png") ||
        (linkText.includes("cover") && href.toLowerCase().includes("png"))
      ) {
        coverPngUrl = resolved;
        hasDownloads = true;
      } else if (
        linkText.includes("kdp content") ||
        linkText.includes("kdp") ||
        href.toLowerCase().includes("kdp-content") ||
        href.toLowerCase().includes("kdpcontent")
      ) {
        kdpContentUrl = resolved;
        hasDownloads = true;
      }
    });

    if (!hasDownloads) return;

    // Extract title — look for nearest heading or strong text
    let title = "";
    const heading = $el.find("h1, h2, h3, h4, h5, h6").first().text().trim();
    const strong = $el.find("strong, b").first().text().trim();

    if (heading) {
      title = heading;
    } else if (strong) {
      title = strong;
    } else {
      // Use first meaningful text fragment
      const rawText = text.replace(/\s+/g, " ").trim();
      title = rawText.substring(0, 80).trim();
    }

    if (!title || title.length < 3) return;
    if (processed.has(title)) return;
    processed.add(title);

    books.push({
      title,
      sourceUrl: SOURCE_URL,
      manuscriptUrl,
      coverJpgUrl,
      coverPngUrl,
      kdpContentUrl,
    });
  });

  // Fallback: if nothing found with the deep strategy, look for all download links
  // and group them by proximity to headings
  if (books.length === 0) {
    logger.warn("Deep scan found no books, trying heading-based scan");

    $("h1, h2, h3, h4").each((_i, heading) => {
      const $heading = $(heading);
      const title = $heading.text().trim();
      if (!title || title.length < 3) return;
      if (processed.has(title)) return;

      // Look at the next siblings for download links
      let manuscriptUrl: string | null = null;
      let coverJpgUrl: string | null = null;
      let coverPngUrl: string | null = null;
      let kdpContentUrl: string | null = null;

      let $next = $heading.next();
      for (let depth = 0; depth < 10 && $next.length > 0; depth++) {
        $next.find("a[href]").addBack("a[href]").each((_j, link) => {
          const href = $(link).attr("href") ?? "";
          const linkText = $(link).text().toLowerCase();
          const resolved = resolveUrl(baseUrl, href);

          if (href.toLowerCase().endsWith(".pdf") || linkText.includes("manuscript") || linkText.includes("6x9")) {
            manuscriptUrl = resolved;
          } else if (href.toLowerCase().endsWith(".jpg") || href.toLowerCase().endsWith(".jpeg")) {
            coverJpgUrl = resolved;
          } else if (href.toLowerCase().endsWith(".png")) {
            coverPngUrl = resolved;
          } else if (linkText.includes("kdp")) {
            kdpContentUrl = resolved;
          }
        });

        // Stop at next heading
        if ($next.is("h1, h2, h3, h4")) break;
        $next = $next.next();
      }

      if (manuscriptUrl || coverJpgUrl || coverPngUrl || kdpContentUrl) {
        processed.add(title);
        books.push({ title, sourceUrl: SOURCE_URL, manuscriptUrl, coverJpgUrl, coverPngUrl, kdpContentUrl });
      }
    });
  }

  logger.info({ count: books.length }, "Discovered books from source");
  return books;
}

export async function scanForNewBooks(): Promise<{ newBooks: number; totalFound: number }> {
  const discovered = await discoverBooks();

  let newCount = 0;
  for (const book of discovered) {
    // Check if book already exists
    const existing = await db
      .select({ id: booksTable.id })
      .from(booksTable)
      .where(eq(booksTable.title, book.title))
      .limit(1);

    if (existing.length > 0) continue;

    // Insert new book
    const [inserted] = await db
      .insert(booksTable)
      .values({
        title: book.title,
        sourceUrl: book.sourceUrl,
        manuscriptUrl: book.manuscriptUrl,
        coverJpgUrl: book.coverJpgUrl,
        coverPngUrl: book.coverPngUrl,
        kdpContentUrl: book.kdpContentUrl,
        status: "discovered",
      })
      .returning({ id: booksTable.id });

    // Create pending upload jobs for all 3 formats
    await db.insert(uploadJobsTable).values([
      { bookId: inserted.id, format: "ebook", status: "pending" },
      { bookId: inserted.id, format: "paperback", status: "pending" },
      { bookId: inserted.id, format: "hardcover", status: "pending" },
    ]);

    newCount++;
    logger.info({ title: book.title, bookId: inserted.id }, "New book discovered and queued");
  }

  return { newBooks: newCount, totalFound: discovered.length };
}
