import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const booksTable = pgTable(
  "books",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    manuscriptUrl: text("manuscript_url"),
    coverJpgUrl: text("cover_jpg_url"),
    coverPngUrl: text("cover_png_url"),
    kdpContentUrl: text("kdp_content_url"),
    kdpContent: text("kdp_content"),
    status: text("status").notNull().default("discovered"),
    discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("books_manuscript_url_unique").on(table.manuscriptUrl),
  ],
);

export const insertBookSchema = createInsertSchema(booksTable).omit({ id: true, discoveredAt: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
