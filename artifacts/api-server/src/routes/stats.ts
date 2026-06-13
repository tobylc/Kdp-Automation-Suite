import { Router } from "express";
import { db, booksTable, uploadJobsTable, scheduleConfigTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router = Router();

router.get("/stats", async (req, res): Promise<void> => {
  const [bookStats] = await db
    .select({
      total: count(),
      ready: sql<number>`count(*) filter (where status = 'ready')`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
    })
    .from(booksTable);

  const [jobStats] = await db
    .select({
      total: count(),
      pending: sql<number>`count(*) filter (where status = 'pending')`,
      running: sql<number>`count(*) filter (where status = 'running')`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
    })
    .from(uploadJobsTable);

  const [schedule] = await db.select().from(scheduleConfigTable).limit(1);

  res.json({
    totalBooks: Number(bookStats?.total ?? 0),
    booksReady: Number(bookStats?.ready ?? 0),
    booksCompleted: Number(bookStats?.completed ?? 0),
    booksFailed: Number(bookStats?.failed ?? 0),
    totalJobs: Number(jobStats?.total ?? 0),
    jobsPending: Number(jobStats?.pending ?? 0),
    jobsRunning: Number(jobStats?.running ?? 0),
    jobsCompleted: Number(jobStats?.completed ?? 0),
    jobsFailed: Number(jobStats?.failed ?? 0),
    lastScanAt: schedule?.lastRunAt?.toISOString() ?? null,
  });
});

export default router;
