import * as cheerio from "cheerio";
import { db, booksTable, uploadJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const BASE_URL = "https://scripturemadesimple.replit.app";
const SOURCE_URL = `${BASE_URL}/my-studies`;

interface KdpContentData {
  description: string;
  categories: string;
  keywords: string;
  series_summary: string;
  back_cover_description: string;
}

interface KdpContentResponse extends KdpContentData {
  success: boolean;
}

interface DiscoveredBook {
  studyId: string;
  title: string;
  author: string | null;
  sourceUrl: string;
  manuscriptUrl: string;
  coverJpgUrl: string;
  coverPngUrl: string;
  kdpContent: string | null;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KDPUploader/1.0)" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchKdpContent(studyId: string): Promise<KdpContentData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/generate-kdp-content/${studyId}`, {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KDPUploader/1.0)" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as KdpContentResponse;
    if (!data.success) return null;
    return {
      description: data.description ?? "",
      categories: data.categories ?? "",
      keywords: data.keywords ?? "",
      series_summary: data.series_summary ?? "",
      back_cover_description: data.back_cover_description ?? "",
    };
  } catch (err) {
    logger.warn({ err, studyId }, "Failed to fetch KDP content for study");
    return null;
  }
}

async function discoverBooks(): Promise<DiscoveredBook[]> {
  logger.info({ url: SOURCE_URL }, "Scanning for new books");
  const html = await fetchPage(SOURCE_URL);
  const $ = cheerio.load(html);
  const books: DiscoveredBook[] = [];

  $("div.study-card[data-study-id]").each((_i, el) => {
    const $card = $(el);
    const studyId = $card.attr("data-study-id");
    if (!studyId) return;

    // Title: from data-book-name (clean, no emoji) or .study-title (strip emoji)
    const rawTitle =
      $card.attr("data-book-name") ||
      $card.find(".study-title").first().text().replace(/^[^\w]*/u, "").trim();
    const title = rawTitle.trim();
    if (!title) return;

    // Author: find .study-date containing "by "
    let author: string | null = null;
    $card.find(".study-date").each((_j, dateEl): false | void => {
      const txt = $(dateEl).text().trim();
      if (txt.startsWith("by ")) {
        author = txt.slice(3).trim();
        return false;
      }
    });

    books.push({
      studyId,
      title,
      author,
      sourceUrl: SOURCE_URL,
      manuscriptUrl: `${BASE_URL}/download/${studyId}/6x9`,
      coverPngUrl: `${BASE_URL}/download-uploaded-cover/${studyId}/png`,
      coverJpgUrl: `${BASE_URL}/download-uploaded-cover/${studyId}/jpg`,
      kdpContent: null,
    });
  });

  logger.info({ count: books.length }, "Discovered books from source HTML");
  return books;
}

async function enrichKdpContent(bookId: number, studyId: string, title: string, author: string | null): Promise<void> {
  logger.info({ bookId, studyId, title }, "Fetching KDP content in background");
  const kdpData = await fetchKdpContent(studyId);
  if (!kdpData) {
    logger.warn({ bookId, studyId }, "KDP content fetch returned nothing");
    return;
  }
  const kdpContent = JSON.stringify({ ...kdpData, author, title });
  await db.update(booksTable).set({ kdpContent }).where(eq(booksTable.id, bookId));
  logger.info({ bookId, title }, "KDP content saved to book record");
}

export async function scanForNewBooks(): Promise<{ newBooks: number; totalFound: number }> {
  const discovered = await discoverBooks();

  let newCount = 0;
  const enrichQueue: Array<{ bookId: number; studyId: string; title: string; author: string | null }> = [];

  for (const book of discovered) {
    // Check if book already exists by title
    const existing = await db
      .select({ id: booksTable.id })
      .from(booksTable)
      .where(eq(booksTable.title, book.title))
      .limit(1);

    if (existing.length > 0) continue;

    // Insert new book immediately (no waiting for KDP content)
    const [inserted] = await db
      .insert(booksTable)
      .values({
        title: book.title,
        sourceUrl: book.sourceUrl,
        manuscriptUrl: book.manuscriptUrl,
        coverJpgUrl: book.coverJpgUrl,
        coverPngUrl: book.coverPngUrl,
        kdpContent: null,
        status: "discovered",
      })
      .returning({ id: booksTable.id });

    // Create pending upload jobs for all 3 formats
    await db.insert(uploadJobsTable).values([
      { bookId: inserted.id, format: "ebook", status: "pending" },
      { bookId: inserted.id, format: "paperback", status: "pending" },
      { bookId: inserted.id, format: "hardcover", status: "pending" },
    ]);

    enrichQueue.push({ bookId: inserted.id, studyId: book.studyId, title: book.title, author: book.author });
    newCount++;
    logger.info({ title: book.title, bookId: inserted.id }, "New book discovered and queued");
  }

  // Enrich KDP content in the background — do not await, returns fast
  if (enrichQueue.length > 0) {
    void (async () => {
      for (const item of enrichQueue) {
        await enrichKdpContent(item.bookId, item.studyId, item.title, item.author);
      }
    })();
  }

  return { newBooks: newCount, totalFound: discovered.length };
}
