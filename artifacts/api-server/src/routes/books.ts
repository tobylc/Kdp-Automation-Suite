import { Router } from "express";
import { db, booksTable, uploadJobsTable, jobLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListBooksResponse,
  GetBookParams,
  ScanForBooksResponse,
} from "@workspace/api-zod";
import { scanForNewBooks } from "../lib/book-scanner";

const router = Router();

router.get("/books", async (req, res): Promise<void> => {
  const books = await db
    .select()
    .from(booksTable)
    .orderBy(desc(booksTable.discoveredAt));

  // Get all jobs to compute per-format status
  const allJobs = await db.select().from(uploadJobsTable);

  const result = books.map((book) => {
    const bookJobs = allJobs.filter((j) => j.bookId === book.id);
    const ebookJob = bookJobs.find((j) => j.format === "ebook");
    const paperbackJob = bookJobs.find((j) => j.format === "paperback");
    const hardcoverJob = bookJobs.find((j) => j.format === "hardcover");

    return {
      id: book.id,
      title: book.title,
      sourceUrl: book.sourceUrl,
      manuscriptUrl: book.manuscriptUrl,
      coverJpgUrl: book.coverJpgUrl,
      coverPngUrl: book.coverPngUrl,
      kdpContentUrl: book.kdpContentUrl,
      discoveredAt: book.discoveredAt.toISOString(),
      status: book.status,
      ebookStatus: ebookJob?.status ?? null,
      paperbackStatus: paperbackJob?.status ?? null,
      hardcoverStatus: hardcoverJob?.status ?? null,
    };
  });

  res.json(ListBooksResponse.parse(result));
});

router.post("/books/scan", async (req, res): Promise<void> => {
  const result = await scanForNewBooks();
  res.json(
    ScanForBooksResponse.parse({
      newBooks: result.newBooks,
      totalFound: result.totalFound,
      message: result.newBooks > 0
        ? `Found ${result.totalFound} books, ${result.newBooks} new titles queued for upload`
        : `Found ${result.totalFound} books — no new titles`,
    }),
  );
});

router.get("/books/:id", async (req, res): Promise<void> => {
  const params = GetBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [book] = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, params.data.id))
    .limit(1);

  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  const jobs = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.bookId, book.id))
    .orderBy(desc(uploadJobsTable.createdAt));

  const jobsWithLogs = await Promise.all(
    jobs.map(async (job) => {
      const logs = await db
        .select()
        .from(jobLogsTable)
        .where(eq(jobLogsTable.jobId, job.id))
        .orderBy(jobLogsTable.createdAt);

      return {
        id: job.id,
        bookId: job.bookId,
        bookTitle: book.title,
        format: job.format,
        status: job.status,
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        errorMessage: job.errorMessage,
        lastScreenshotUrl: job.lastScreenshotUrl,
        logs: logs.map((l) => ({
          id: l.id,
          jobId: l.jobId,
          level: l.level,
          message: l.message,
          screenshotUrl: l.screenshotUrl,
          createdAt: l.createdAt.toISOString(),
        })),
      };
    }),
  );

  res.json({
    id: book.id,
    title: book.title,
    sourceUrl: book.sourceUrl,
    manuscriptUrl: book.manuscriptUrl,
    coverJpgUrl: book.coverJpgUrl,
    coverPngUrl: book.coverPngUrl,
    kdpContentUrl: book.kdpContentUrl,
    kdpContent: book.kdpContent,
    discoveredAt: book.discoveredAt.toISOString(),
    status: book.status,
    jobs: jobsWithLogs,
  });
});

export default router;
