import app from "./app";
import { logger } from "./lib/logger";
import { initScheduler } from "./lib/scheduler";
import { db, uploadJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Startup recovery ─────────────────────────────────────────────────────
  // If the server was restarted while a job was running, that job is stuck
  // in "running" state forever. Reset those orphaned jobs to "pending" so
  // they will be picked up on the next scheduled run or manual trigger.
  try {
    const orphaned = await db
      .update(uploadJobsTable)
      .set({
        status: "pending",
        startedAt: null,
        errorMessage: "Re-queued: server restarted while job was running",
      })
      .where(eq(uploadJobsTable.status, "running"))
      .returning({ id: uploadJobsTable.id });

    if (orphaned.length > 0) {
      logger.warn(
        { count: orphaned.length, ids: orphaned.map((j) => j.id) },
        "Reset orphaned running jobs to pending on startup",
      );
    }
  } catch (recoveryErr) {
    logger.error({ err: recoveryErr }, "Startup job recovery failed");
  }

  // ── Scheduler ────────────────────────────────────────────────────────────
  try {
    await initScheduler();
    logger.info("Scheduler initialized");
  } catch (schedErr) {
    logger.error({ err: schedErr }, "Scheduler init failed");
  }
});
