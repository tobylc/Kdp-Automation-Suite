import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const aiProviderConfigTable = pgTable("ai_provider_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("anthropic"),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  smartRoutingEnabled: boolean("smart_routing_enabled").notNull().default(false),
  fallbackProvider: text("fallback_provider"),
  fallbackModel: text("fallback_model"),
  fallbackApiKey: text("fallback_api_key"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AiProviderConfig = typeof aiProviderConfigTable.$inferSelect;
