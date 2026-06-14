import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const aiProviderConfigTable = pgTable("ai_provider_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("anthropic"),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AiProviderConfig = typeof aiProviderConfigTable.$inferSelect;
