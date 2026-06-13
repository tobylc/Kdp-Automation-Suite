import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { booksTable } from "./books";

export const uploadJobsTable = pgTable("upload_jobs", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id),
  format: text("format").notNull(), // ebook | paperback | hardcover
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  errorMessage: text("error_message"),
  lastScreenshotUrl: text("last_screenshot_url"),
});

export const insertUploadJobSchema = createInsertSchema(uploadJobsTable).omit({ id: true, createdAt: true });
export type InsertUploadJob = z.infer<typeof insertUploadJobSchema>;
export type UploadJob = typeof uploadJobsTable.$inferSelect;
