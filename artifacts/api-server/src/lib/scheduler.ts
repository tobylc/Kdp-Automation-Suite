import cron from "node-cron";
import { db, scheduleConfigTable, uploadJobsTable, booksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { scanForNewBooks } from "./book-scanner";
import { scanKdpBookshelf } from "./kdp-bookshelf-scanner";
import { runUploadJob } from "./agent-runner";

let currentTask: cron.ScheduledTask | null = null;

/** Returns true when a book's KDP status for a given format means it's already done. */
function isFormatAlreadyLive(kdpStatus: string | null): boolean {
  return kdpStatus === "live" || kdpStatus === "in_review" || kdpStatus === "publishing";
}

async function runScheduledWork(): Promise<void> {
  logger.info("Scheduled run: scanning KDP bookshelf for live statuses");

  // 1. Scan KDP bookshelf first so we have up-to-date statuses before running jobs
  try {
    const bsResult = await scanKdpBookshelf();
    logger.info({ scanned: bsResult.scanned, updated: bsResult.updated }, "Bookshelf scan complete");
  } catch (err) {
    logger.error({ err }, "Bookshelf scan failed during scheduled run — continuing");
  }

  logger.info("Scheduled run: scanning source site for new book titles");

  // 2. Scan for new books on the source site
  try {
    const result = await scanForNewBooks();
    logger.info({ newBooks: result.newBooks, totalFound: result.totalFound }, "Source scan complete");
  } catch (err) {
    logger.error({ err }, "Source scan failed during scheduled run");
  }

  // 3. Queue all pending jobs, but skip formats already live on KDP
  const pending = await db
    .select({
      job: uploadJobsTable,
      book: booksTable,
    })
    .from(uploadJobsTable)
    .innerJoin(booksTable, eq(uploadJobsTable.bookId, booksTable.id))
    .where(eq(uploadJobsTable.status, "pending"));

  const eligible = pending.filter(({ job, book }) => {
    if (job.format === "ebook" && isFormatAlreadyLive(book.ebookKdpStatus)) return false;
    if (job.format === "paperback" && isFormatAlreadyLive(book.paperbackKdpStatus)) return false;
    if (job.format === "hardcover" && isFormatAlreadyLive(book.hardcoverKdpStatus)) return false;
    return true;
  });

  const skipped = pending.length - eligible.length;
  if (skipped > 0) {
    logger.info({ skipped }, "Scheduled run: skipping jobs for formats already live on KDP");
  }

  logger.info({ count: eligible.length }, "Running eligible pending upload jobs");

  for (const { job } of eligible) {
    try {
      await runUploadJob(job.id);
    } catch (err) {
      logger.error({ jobId: job.id, err }, "Upload job failed during scheduled run");
    }
  }

  // Update last run time
  const [config] = await db.select().from(scheduleConfigTable).limit(1);
  if (config) {
    await db
      .update(scheduleConfigTable)
      .set({ lastRunAt: new Date() })
      .where(eq(scheduleConfigTable.id, config.id));
  }
}

export async function initScheduler(): Promise<void> {
  const existing = await db.select().from(scheduleConfigTable).limit(1);
  if (existing.length === 0) {
    await db.insert(scheduleConfigTable).values({
      cronExpression: "0 * * * *",
      enabled: true,
    });
    logger.info("Created default schedule config (hourly)");
  }

  await applySchedule();
}

export async function applySchedule(): Promise<void> {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  const [config] = await db.select().from(scheduleConfigTable).limit(1);
  if (!config || !config.enabled) {
    logger.info("Scheduler disabled or no config — not scheduling");
    return;
  }

  if (!cron.validate(config.cronExpression)) {
    logger.warn({ expression: config.cronExpression }, "Invalid cron expression — not scheduling");
    return;
  }

  currentTask = cron.schedule(config.cronExpression, () => {
    runScheduledWork().catch((err) => logger.error({ err }, "Scheduled work error"));
  });

  logger.info({ expression: config.cronExpression }, "Scheduler started");
}

export async function runAllPendingJobs(): Promise<number> {
  // Fetch pending jobs joined with book KDP statuses
  const pending = await db
    .select({
      job: uploadJobsTable,
      book: booksTable,
    })
    .from(uploadJobsTable)
    .innerJoin(booksTable, eq(uploadJobsTable.bookId, booksTable.id))
    .where(eq(uploadJobsTable.status, "pending"));

  // Filter out formats already live/in-review on KDP
  const eligible = pending.filter(({ job, book }) => {
    if (job.format === "ebook" && isFormatAlreadyLive(book.ebookKdpStatus)) return false;
    if (job.format === "paperback" && isFormatAlreadyLive(book.paperbackKdpStatus)) return false;
    if (job.format === "hardcover" && isFormatAlreadyLive(book.hardcoverKdpStatus)) return false;
    return true;
  });

  const skipped = pending.length - eligible.length;
  if (skipped > 0) {
    logger.info({ skipped }, "runAllPendingJobs: skipping formats already live on KDP");
  }

  logger.info({ count: eligible.length }, "Queuing eligible pending jobs");

  setImmediate(async () => {
    for (const { job } of eligible) {
      try {
        await runUploadJob(job.id);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "Job failed");
      }
    }
  });

  return eligible.length;
}
