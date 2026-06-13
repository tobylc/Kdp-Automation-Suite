import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scheduleConfigTable = pgTable("schedule_config", {
  id: serial("id").primaryKey(),
  cronExpression: text("cron_expression").notNull().default("0 * * * *"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduleConfigSchema = createInsertSchema(scheduleConfigTable).omit({ id: true, createdAt: true });
export type InsertScheduleConfig = z.infer<typeof insertScheduleConfigSchema>;
export type ScheduleConfig = typeof scheduleConfigTable.$inferSelect;
