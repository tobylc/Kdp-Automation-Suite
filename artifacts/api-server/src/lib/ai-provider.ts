/**
 * AI Provider Abstraction — Smart Cascade Router
 *
 * Supports three providers: anthropic, openai, openrouter.
 * When smart routing is enabled, the app tries a cheap/free primary model first.
 * If it fails (credit error, rate limit, network) OR returns a low-confidence
 * response, it automatically escalates to the configured fallback model.
 *
 * This means free models are tried first; the reliable heavyweight only fires
 * when actually needed.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { anthropic as replitAnthropic } from "@workspace/integrations-anthropic-ai";
import { db, aiProviderConfigTable } from "@workspace/db";
import { logger } from "./logger";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedAiConfig {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
}

interface FullConfig {
  primary: ResolvedAiConfig;
  fallback: ResolvedAiConfig | null;
  smartRoutingEnabled: boolean;
}

// ─── Uncertainty detection ────────────────────────────────────────────────────

const UNCERTAINTY_PHRASES = [
  "i cannot see",
  "i can't see",
  "unable to see",
  "cannot determine",
  "can't determine",
  "not visible",
  "not sure",
  "unclear",
  "i'm not able",
  "i am not able",
  "cannot identify",
  "can't identify",
  "don't know",
  "do not know",
];

/**
 * Returns true if the AI response text signals uncertainty or inability to act.
 * Used to decide whether to escalate to the fallback model.
 */
function isUncertain(responseText: string): boolean {
  const lower = responseText.toLowerCase();
  return UNCERTAINTY_PHRASES.some((phrase) => lower.includes(phrase));
}

// ─── Config loader ────────────────────────────────────────────────────────────

export async function getAiConfig(): Promise<ResolvedAiConfig> {
  const [row] = await db.select().from(aiProviderConfigTable).limit(1);
  if (!row) {
    return { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: null, baseUrl: null };
  }
  return { provider: row.provider, model: row.model, apiKey: row.apiKey ?? null, baseUrl: row.baseUrl ?? null };
}

async function getFullConfig(): Promise<FullConfig> {
  const [row] = await db.select().from(aiProviderConfigTable).limit(1);
  if (!row) {
    return {
      primary: { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: null, baseUrl: null },
      fallback: null,
      smartRoutingEnabled: false,
    };
  }

  const primary: ResolvedAiConfig = {
    provider: row.provider,
    model: row.model,
    apiKey: row.apiKey ?? null,
    baseUrl: row.baseUrl ?? null,
  };

  const fallback: ResolvedAiConfig | null =
    row.smartRoutingEnabled && row.fallbackProvider && row.fallbackModel
      ? {
          provider: row.fallbackProvider,
          model: row.fallbackModel,
          apiKey: row.fallbackApiKey ?? null,
          baseUrl: null,
        }
      : null;

  return { primary, fallback, smartRoutingEnabled: row.smartRoutingEnabled };
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function callAnthropic(
  config: ResolvedAiConfig,
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let client: Anthropic;

  if (config.apiKey) {
    client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl ?? undefined });
  } else {
    client = replitAnthropic as unknown as Anthropic;
  }

  // Anthropic requires at least a 1-char image — skip image for empty screenshots (test calls)
  const contentBlocks: Anthropic.MessageParam["content"] = screenshotBase64
    ? [
        { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
        { type: "text", text: userMessage },
      ]
    : [{ type: "text", text: userMessage }];

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt || undefined,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Anthropic");
  return textBlock.text;
}

async function callOpenAiCompat(
  config: ResolvedAiConfig,
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(`Provider "${config.provider}" requires an API key. Add one in AI Provider Settings.`);
  }

  const baseURL = config.baseUrl ?? (config.provider === "openrouter" ? OPENROUTER_BASE_URL : undefined);
  const client = new OpenAI({ apiKey: config.apiKey, baseURL });

  const extraHeaders: Record<string, string> =
    config.provider === "openrouter"
      ? { "HTTP-Referer": "https://kdp-upload-automation", "X-Title": "KDP Upload Automation" }
      : {};

  const userContent: OpenAI.ChatCompletionContentPart[] = screenshotBase64
    ? [
        { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        { type: "text", text: userMessage },
      ]
    : [{ type: "text", text: userMessage }];

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userContent });

  const response = await client.chat.completions.create(
    { model: config.model, max_tokens: 1024, messages },
    { headers: extraHeaders },
  );

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("No text response from OpenAI-compatible provider");
  return text;
}

async function callProvider(
  config: ResolvedAiConfig,
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (config.provider === "anthropic") {
    return callAnthropic(config, screenshotBase64, systemPrompt, userMessage);
  }
  return callOpenAiCompat(config, screenshotBase64, systemPrompt, userMessage);
}

// ─── Public entry point (with cascade) ───────────────────────────────────────

export async function askAi(
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const { primary, fallback, smartRoutingEnabled } = await getFullConfig();

  logger.info(
    { provider: primary.provider, model: primary.model, smartRouting: smartRoutingEnabled },
    "ai-provider: routing request",
  );

  // ── Try primary model ──────────────────────────────────────────────────────
  let primaryResult: string | null = null;
  let primaryError: string | null = null;

  try {
    primaryResult = await callProvider(primary, screenshotBase64, systemPrompt, userMessage);
  } catch (err) {
    primaryError = err instanceof Error ? err.message : String(err);
    logger.warn({ provider: primary.provider, model: primary.model, err: primaryError }, "ai-provider: primary model failed");
  }

  // ── Decide whether to escalate ─────────────────────────────────────────────
  if (!smartRoutingEnabled || !fallback) {
    if (primaryError) throw new Error(primaryError);
    return primaryResult!;
  }

  const shouldEscalate =
    primaryError !== null ||
    (primaryResult !== null && isUncertain(primaryResult));

  if (!shouldEscalate) {
    logger.info({ model: primary.model }, "ai-provider: primary succeeded, no escalation needed");
    return primaryResult!;
  }

  const reason = primaryError ? `primary error: ${primaryError.slice(0, 80)}` : "primary response uncertain";
  logger.info(
    { primaryModel: primary.model, fallbackModel: fallback.model, reason },
    "ai-provider: escalating to fallback model",
  );

  // ── Try fallback model ─────────────────────────────────────────────────────
  try {
    const fallbackResult = await callProvider(fallback, screenshotBase64, systemPrompt, userMessage);
    logger.info({ model: fallback.model }, "ai-provider: fallback succeeded");
    return fallbackResult;
  } catch (fallbackErr) {
    const fallbackError = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    logger.error({ primaryError, fallbackError }, "ai-provider: both primary and fallback failed");
    // Re-throw the original primary error if primary was the one that failed, for cleaner UX
    throw new Error(primaryError ?? fallbackError);
  }
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConfig(config: ResolvedAiConfig): Promise<{ success: boolean; message: string }> {
  try {
    let reply: string;
    if (config.provider === "anthropic") {
      reply = await callAnthropic(config, "", "Respond with OK.", "Say OK");
    } else {
      if (!config.apiKey) {
        return { success: false, message: "No API key configured" };
      }
      const baseURL = config.baseUrl ?? (config.provider === "openrouter" ? OPENROUTER_BASE_URL : undefined);
      const client = new OpenAI({ apiKey: config.apiKey, baseURL });
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      });
      reply = res.choices[0]?.message?.content ?? "";
    }
    return { success: true, message: `Connected — replied: "${reply.trim().slice(0, 60)}"` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function testAiConnection(): Promise<{ success: boolean; message: string; model: string; fallbackResult?: { success: boolean; message: string; model: string } }> {
  const { primary, fallback } = await getFullConfig();
  const result = await testConfig(primary);

  const out: { success: boolean; message: string; model: string; fallbackResult?: { success: boolean; message: string; model: string } } = {
    ...result,
    model: primary.model,
  };

  if (fallback) {
    const fb = await testConfig(fallback);
    out.fallbackResult = { ...fb, model: fallback.model };
  }

  return out;
}
