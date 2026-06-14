import { Router } from "express";
import { db, aiProviderConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { testAiConnection } from "../lib/ai-provider";

const router = Router();

const VALID_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
type Provider = typeof VALID_PROVIDERS[number];

function validateInput(body: unknown): { provider: Provider; model: string; apiKey?: string | null; baseUrl?: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!VALID_PROVIDERS.includes(b.provider as Provider)) return null;
  if (typeof b.model !== "string" || b.model.trim() === "") return null;
  return {
    provider: b.provider as Provider,
    model: b.model.trim(),
    apiKey: b.apiKey === undefined ? undefined : (b.apiKey === null || b.apiKey === "" ? null : String(b.apiKey)),
    baseUrl: b.baseUrl === undefined ? undefined : (b.baseUrl === null || b.baseUrl === "" ? null : String(b.baseUrl)),
  };
}

function serializeConfig(row: typeof aiProviderConfigTable.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    hasApiKey: !!row.apiKey,
    baseUrl: row.baseUrl ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/settings/ai-provider", async (req, res): Promise<void> => {
  const [row] = await db.select().from(aiProviderConfigTable).limit(1);
  if (!row) {
    const [created] = await db
      .insert(aiProviderConfigTable)
      .values({ provider: "anthropic", model: "claude-sonnet-4-6" })
      .returning();
    res.json(serializeConfig(created));
    return;
  }
  res.json(serializeConfig(row));
});

router.put("/settings/ai-provider", async (req, res): Promise<void> => {
  const parsed = validateInput(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid input: provider must be anthropic/openai/openrouter and model must be non-empty" });
    return;
  }

  const { provider, model, apiKey, baseUrl } = parsed;

  const [existing] = await db.select().from(aiProviderConfigTable).limit(1);

  const updates: Partial<typeof aiProviderConfigTable.$inferInsert> = {
    provider,
    model,
    updatedAt: new Date(),
  };

  // Only update apiKey if a new value is explicitly provided (not undefined)
  if (apiKey !== undefined) {
    updates.apiKey = apiKey ?? null;
  } else if (existing) {
    updates.apiKey = existing.apiKey;
  }

  if (baseUrl !== undefined) {
    updates.baseUrl = baseUrl ?? null;
  }

  let row: typeof aiProviderConfigTable.$inferSelect;
  if (!existing) {
    [row] = await db.insert(aiProviderConfigTable).values(updates as typeof aiProviderConfigTable.$inferInsert).returning();
  } else {
    [row] = await db
      .update(aiProviderConfigTable)
      .set(updates)
      .where(eq(aiProviderConfigTable.id, existing.id))
      .returning();
  }

  req.log.info({ provider, model }, "AI provider config updated");
  res.json(serializeConfig(row));
});

router.post("/settings/ai-provider/test", async (req, res): Promise<void> => {
  const result = await testAiConnection();
  res.json(result);
});

export default router;
