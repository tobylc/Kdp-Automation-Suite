import { Router } from "express";
import { db, scheduleConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateScheduleBody } from "@workspace/api-zod";
import { applySchedule } from "../lib/scheduler";
import cron from "node-cron";

const router = Router();

router.get("/schedule", async (req, res): Promise<void> => {
  const [config] = await db.select().from(scheduleConfigTable).limit(1);
  if (!config) {
    res.status(404).json({ error: "No schedule configuration found" });
    return;
  }
  res.json({
    id: config.id,
    cronExpression: config.cronExpression,
    enabled: config.enabled,
    lastRunAt: config.lastRunAt?.toISOString() ?? null,
    nextRunAt: config.nextRunAt?.toISOString() ?? null,
    createdAt: config.createdAt.toISOString(),
  });
});

router.patch("/schedule", async (req, res): Promise<void> => {
  const parsed = UpdateScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(scheduleConfigTable).limit(1);
  if (!existing) {
    res.status(404).json({ error: "No schedule configuration found" });
    return;
  }

  const updates: Partial<typeof parsed.data> = {};
  if (parsed.data.cronExpression !== undefined) {
    if (!cron.validate(parsed.data.cronExpression)) {
      res.status(400).json({ error: "Invalid cron expression" });
      return;
    }
    updates.cronExpression = parsed.data.cronExpression;
  }
  if (parsed.data.enabled !== undefined) {
    updates.enabled = parsed.data.enabled;
  }

  const [updated] = await db
    .update(scheduleConfigTable)
    .set(updates)
    .where(eq(scheduleConfigTable.id, existing.id))
    .returning();

  // Reapply the schedule with new settings
  await applySchedule();

  res.json({
    id: updated.id,
    cronExpression: updated.cronExpression,
    enabled: updated.enabled,
    lastRunAt: updated.lastRunAt?.toISOString() ?? null,
    nextRunAt: updated.nextRunAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
