/**
 * Global serial upload job queue
 *
 * This module is the SINGLE entry-point for running any upload job. All call
 * paths — the cron scheduler, "Run All", and individual "Run" buttons — must
 * go through enqueueUploadJob(). Direct calls to runUploadJob() outside this
 * module are intentionally avoided.
 *
 * Guarantees:
 *   1. Only one upload job is active at any moment (no parallelism, ever).
 *   2. A human-paced pause of 20–45 seconds is inserted between consecutive
 *      jobs so the KDP activity pattern looks like a person working through
 *      their list, not an automated script.
 *   3. Queued jobs run in the order they were enqueued (FIFO).
 */

import { runUploadJob } from "./agent-runner";
import { logger } from "./logger";

// ─── Inter-job human pause ────────────────────────────────────────────────────

const INTER_JOB_MIN_MS = 20_000; // 20 s  — minimum gap between jobs
const INTER_JOB_MAX_MS = 45_000; // 45 s  — maximum gap between jobs

// ─── Queue state ──────────────────────────────────────────────────────────────

/** Promise chain — the core of the serial queue */
let tail: Promise<void> = Promise.resolve();

/** When the last job finished (null = no job has run this session) */
let lastJobFinishedAt: number | null = null;

/** Job ID currently executing, or null if idle */
let activeJobId: number | null = null;

/** Count of jobs waiting in line (not yet started) */
let pendingInQueue = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

export function isJobRunning(): boolean {
  return activeJobId !== null;
}

export function runningJobId(): number | null {
  return activeJobId;
}

export function jobsWaiting(): number {
  return pendingInQueue;
}

/**
 * Add a job to the end of the serial queue.
 * Returns immediately — the job will start when all prior jobs have finished.
 */
export function enqueueUploadJob(jobId: number): void {
  pendingInQueue++;
  logger.info({ jobId, queueDepth: pendingInQueue }, "Job enqueued");

  tail = tail
    .then(async () => {
      pendingInQueue = Math.max(0, pendingInQueue - 1);

      // If a job recently finished, wait the remaining time of the inter-job
      // gap.  If the queue has been idle for a while the gap is already
      // "used up" and the job starts immediately.
      if (lastJobFinishedAt !== null) {
        const targetPause =
          INTER_JOB_MIN_MS +
          Math.floor(Math.random() * (INTER_JOB_MAX_MS - INTER_JOB_MIN_MS));
        const elapsed = Date.now() - lastJobFinishedAt;
        const remaining = targetPause - elapsed;

        if (remaining > 1_000) {
          logger.info(
            { jobId, pauseSec: Math.round(remaining / 1_000) },
            "Human-paced inter-job pause before next upload",
          );
          await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        }
      }

      activeJobId = jobId;
      logger.info({ jobId }, "Starting upload job (serial queue)");

      try {
        await runUploadJob(jobId);
      } finally {
        activeJobId = null;
        lastJobFinishedAt = Date.now();
      }
    })
    .catch((err) => {
      activeJobId = null;
      lastJobFinishedAt = Date.now();
      logger.error({ jobId, err }, "Upload job failed in serial queue");
    });
}
