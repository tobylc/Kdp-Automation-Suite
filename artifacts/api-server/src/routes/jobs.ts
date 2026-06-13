import { Router } from "express";
import { db, uploadJobsTable, jobLogsTable, booksTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  ListJobsQueryParams,
  GetJobParams,
  RunJobParams,
  ListJobsResponse,
  RunAllJobsResponse,
} from "@workspace/api-zod";
import { runUploadJob } from "../lib/agent-runner";
import { runAllPendingJobs } from "../lib/scheduler";

const router = Router();

router.get("/jobs", async (req, res): Promise<void> => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, format, limit } = parsed.data;

  const jobs = await db
    .select({
      id: uploadJobsTable.id,
      bookId: uploadJobsTable.bookId,
      bookTitle: booksTable.title,
      format: uploadJobsTable.format,
      status: uploadJobsTable.status,
      startedAt: uploadJobsTable.startedAt,
      completedAt: uploadJobsTable.completedAt,
      createdAt: uploadJobsTable.createdAt,
      errorMessage: uploadJobsTable.errorMessage,
      lastScreenshotUrl: uploadJobsTable.lastScreenshotUrl,
    })
    .from(uploadJobsTable)
    .innerJoin(booksTable, eq(uploadJobsTable.bookId, booksTable.id))
    .orderBy(desc(uploadJobsTable.createdAt))
    .limit(limit ?? 200);

  const filtered = jobs
    .filter((j) => !status || j.status === status)
    .filter((j) => !format || j.format === format);

  res.json(
    ListJobsResponse.parse(
      filtered.map((j) => ({
        ...j,
        startedAt: j.startedAt?.toISOString() ?? null,
        completedAt: j.completedAt?.toISOString() ?? null,
        createdAt: j.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/jobs/run-all", async (req, res): Promise<void> => {
  const queued = await runAllPendingJobs();
  res.json(
    RunAllJobsResponse.parse({
      queued,
      message: queued > 0
        ? `Queued ${queued} pending upload jobs`
        : "No pending jobs to run",
    }),
  );
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [job] = await db
    .select({
      id: uploadJobsTable.id,
      bookId: uploadJobsTable.bookId,
      bookTitle: booksTable.title,
      format: uploadJobsTable.format,
      status: uploadJobsTable.status,
      startedAt: uploadJobsTable.startedAt,
      completedAt: uploadJobsTable.completedAt,
      createdAt: uploadJobsTable.createdAt,
      errorMessage: uploadJobsTable.errorMessage,
      lastScreenshotUrl: uploadJobsTable.lastScreenshotUrl,
    })
    .from(uploadJobsTable)
    .innerJoin(booksTable, eq(uploadJobsTable.bookId, booksTable.id))
    .where(eq(uploadJobsTable.id, id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const logs = await db
    .select()
    .from(jobLogsTable)
    .where(eq(jobLogsTable.jobId, id))
    .orderBy(jobLogsTable.createdAt);

  res.json({
    ...job,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    logs: logs.map((l) => ({
      id: l.id,
      jobId: l.jobId,
      level: l.level,
      message: l.message,
      screenshotUrl: l.screenshotUrl,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});

router.post("/jobs/:id/run", async (req, res): Promise<void> => {
  const params = RunJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.id, params.data.id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Reset job status to pending so it can be rerun
  await db
    .update(uploadJobsTable)
    .set({ status: "pending", errorMessage: null, startedAt: null, completedAt: null })
    .where(eq(uploadJobsTable.id, job.id));

  // Run in background
  setImmediate(() => {
    runUploadJob(job.id).catch(() => {});
  });

  const [updated] = await db
    .select({
      id: uploadJobsTable.id,
      bookId: uploadJobsTable.bookId,
      bookTitle: booksTable.title,
      format: uploadJobsTable.format,
      status: uploadJobsTable.status,
      startedAt: uploadJobsTable.startedAt,
      completedAt: uploadJobsTable.completedAt,
      createdAt: uploadJobsTable.createdAt,
      errorMessage: uploadJobsTable.errorMessage,
      lastScreenshotUrl: uploadJobsTable.lastScreenshotUrl,
    })
    .from(uploadJobsTable)
    .innerJoin(booksTable, eq(uploadJobsTable.bookId, booksTable.id))
    .where(eq(uploadJobsTable.id, job.id))
    .limit(1);

  res.json({
    ...updated,
    startedAt: updated?.startedAt?.toISOString() ?? null,
    completedAt: updated?.completedAt?.toISOString() ?? null,
    createdAt: updated?.createdAt.toISOString() ?? new Date().toISOString(),
  });
});

export default router;
