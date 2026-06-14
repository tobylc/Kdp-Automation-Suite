/**
 * AI Provider Abstraction
 *
 * Routes AI vision calls to the user-configured provider:
 *   - anthropic  → Anthropic SDK (Replit integration or user API key)
 *   - openai     → OpenAI SDK (user API key)
 *   - openrouter → OpenAI-compatible SDK pointed at openrouter.ai
 *
 * All providers receive a screenshot + system prompt + user message and
 * return a plain text response string for the caller to parse.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { anthropic as replitAnthropic } from "@workspace/integrations-anthropic-ai";
import { db, aiProviderConfigTable } from "@workspace/db";
import { logger } from "./logger";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// ─── Config helpers ───────────────────────────────────────────────────────────

export interface ResolvedAiConfig {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
}

export async function getAiConfig(): Promise<ResolvedAiConfig> {
  const [row] = await db.select().from(aiProviderConfigTable).limit(1);
  if (!row) {
    return { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: null, baseUrl: null };
  }
  return { provider: row.provider, model: row.model, apiKey: row.apiKey ?? null, baseUrl: row.baseUrl ?? null };
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function askAnthropic(
  config: ResolvedAiConfig,
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let client: Anthropic;

  if (config.apiKey) {
    client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
    });
  } else {
    client = replitAnthropic as unknown as Anthropic;
  }

  const response = await (client as Anthropic).messages.create({
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
          },
          { type: "text", text: userMessage },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic");
  }
  return textBlock.text;
}

async function askOpenAiCompat(
  config: ResolvedAiConfig,
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(`Provider "${config.provider}" requires an API key. Add one in AI Provider Settings.`);
  }

  const baseURL =
    config.baseUrl ??
    (config.provider === "openrouter" ? OPENROUTER_BASE_URL : undefined);

  const client = new OpenAI({ apiKey: config.apiKey, baseURL });

  const extraHeaders: Record<string, string> =
    config.provider === "openrouter"
      ? { "HTTP-Referer": "https://kdp-upload-automation", "X-Title": "KDP Upload Automation" }
      : {};

  const response = await client.chat.completions.create(
    {
      model: config.model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${screenshotBase64}` },
            },
            { type: "text", text: userMessage },
          ],
        },
      ],
    },
    { headers: extraHeaders },
  );

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("No text response from OpenAI-compatible provider");
  return text;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function askAi(
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const config = await getAiConfig();
  logger.info({ provider: config.provider, model: config.model }, "ai-provider: routing request");

  if (config.provider === "anthropic") {
    return askAnthropic(config, screenshotBase64, systemPrompt, userMessage);
  }
  return askOpenAiCompat(config, screenshotBase64, systemPrompt, userMessage);
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testAiConnection(): Promise<{ success: boolean; message: string; model: string }> {
  const config = await getAiConfig();
  try {
    let reply: string;
    if (config.provider === "anthropic") {
      reply = await askAnthropic(config, "", "Respond with OK.", "Say OK");
    } else {
      // For vision providers we test without an image
      if (!config.apiKey) {
        return { success: false, message: "No API key configured", model: config.model };
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
    return { success: true, message: `Connected — model replied: "${reply.trim().slice(0, 60)}"`, model: config.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, model: config.model };
  }
}
