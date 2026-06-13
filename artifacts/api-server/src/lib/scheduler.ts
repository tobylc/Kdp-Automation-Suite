import cron from "node-cron";
import { db, scheduleConfigTable, uploadJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { scanForNewBooks } from "./book-scanner";
import { runUploadJob } from "./agent-runner";

let currentTask: cron.ScheduledTask | null = null;

async function runScheduledWork(): Promise<void> {
  logger.info("Scheduled run: scanning for new books");

  try {
    const result = await scanForNewBooks();
    logger.info({ newBooks: result.newBooks, totalFound: result.totalFound }, "Scan complete");
  } catch (err) {
    logger.error({ err }, "Scan failed during scheduled run");
  }

  // Queue all pending jobs
  const pending = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.status, "pending"));

  logger.info({ count: pending.length }, "Running pending upload jobs");

  for (const job of pending) {
    try {
      // Run sequentially to avoid hammering KDP
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
  // Ensure default schedule config exists
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
  // Stop existing task
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
  const pending = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.status, "pending"));

  logger.info({ count: pending.length }, "Queuing all pending jobs");

  // Run jobs in background (don't await)
  setImmediate(async () => {
    for (const job of pending) {
      try {
        await runUploadJob(job.id);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "Job failed");
      }
    }
  });

  return pending.length;
}
