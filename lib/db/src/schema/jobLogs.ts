import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { uploadJobsTable } from "./uploadJobs";

export const jobLogsTable = pgTable("job_logs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => uploadJobsTable.id),
  level: text("level").notNull().default("info"), // info | warn | error | success
  message: text("message").notNull(),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJobLogSchema = createInsertSchema(jobLogsTable).omit({ id: true, createdAt: true });
export type InsertJobLog = z.infer<typeof insertJobLogSchema>;
export type JobLog = typeof jobLogsTable.$inferSelect;
