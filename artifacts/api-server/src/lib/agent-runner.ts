import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, uploadJobsTable, jobLogsTable, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import path from "path";
import fs from "fs";

const KDP_URL = "https://kdp.amazon.com";
const MAX_STEPS = 40;
const SCREENSHOT_DIR = path.resolve(process.cwd(), "artifacts/api-server/uploads/screenshots");

// Ensure screenshot directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Singleton browser instance — shared across agent runs
let browserInstance: Browser | null = null;
let browserContext: BrowserContext | null = null;

async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!browserInstance || !browserInstance.isConnected()) {
    logger.info("Launching Playwright browser");
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });
  }

  if (!browserContext) {
    browserContext = await browserInstance.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  }

  return { browser: browserInstance, context: browserContext };
}

async function addLog(
  jobId: number,
  level: "info" | "warn" | "error" | "success",
  message: string,
  screenshotUrl?: string,
): Promise<void> {
  await db.insert(jobLogsTable).values({ jobId, level, message, screenshotUrl: screenshotUrl ?? null });
}

async function takeScreenshot(page: Page, jobId: number, stepName: string): Promise<string | null> {
  try {
    const filename = `job-${jobId}-${Date.now()}-${stepName.replace(/\s+/g, "_")}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    // Return relative URL that the frontend can use
    return `/api/screenshots/${filename}`;
  } catch (err) {
    logger.warn({ err, jobId, stepName }, "Screenshot failed");
    return null;
  }
}

interface AgentAction {
  action: "click" | "type" | "scroll" | "navigate" | "wait" | "done" | "upload_file" | "select";
  selector?: string;
  text?: string;
  url?: string;
  milliseconds?: number;
  filepath?: string;
  value?: string;
  reasoning: string;
  isComplete?: boolean;
  error?: string;
}

async function askClaude(
  page: Page,
  jobId: number,
  format: string,
  bookTitle: string,
  bookData: Record<string, string | null>,
  stepNumber: number,
  previousActions: string[],
): Promise<AgentAction> {
  const screenshotBuffer = await page.screenshot({ fullPage: false });
  const base64Screenshot = screenshotBuffer.toString("base64");

  // Parse KDP content JSON if available
  let kdpDetails = "";
  if (bookData.kdpContent) {
    try {
      const kdp = JSON.parse(bookData.kdpContent) as Record<string, string>;
      kdpDetails = `
KDP CONTENT TO USE (copy these exactly into the KDP form fields):
- Author: ${kdp["author"] ?? "Unknown"}
- Description: ${kdp["description"] ?? ""}
- Keywords (7, one per field): ${kdp["keywords"] ?? ""}
- Categories: ${kdp["categories"] ?? ""}
- Back Cover / Series Summary: ${kdp["series_summary"] ?? ""}`;
    } catch {
      kdpDetails = "\n- KDP content: available but could not be parsed";
    }
  }

  // Format-specific guidance
  const formatGuidance: Record<string, string> = {
    ebook: `
FORMAT: Kindle eBook
- Navigate to KDP Bookshelf → Create a new Kindle eBook (or update existing)
- Use the manuscript file URL as the eBook content (KDP accepts .docx)
- Cover: use the JPG cover image
- Set price, territories (worldwide), and publishing rights
- The KDP eBook workflow has 3 pages: Kindle eBook Details → Kindle eBook Content → Kindle eBook Pricing`,
    paperback: `
FORMAT: Paperback
- Navigate to KDP Bookshelf → Create a new Paperback (or update existing)
- Use the manuscript file URL (6"x9" .docx) for the interior
- Cover: use the PNG cover image (for print-ready cover)
- Trim size: 6" x 9"
- The KDP Paperback workflow has 3 pages: Paperback Details → Paperback Content → Paperback Rights & Pricing`,
    hardcover: `
FORMAT: Hardcover
- Navigate to KDP Bookshelf → Create a new Hardcover (or update existing)
- Use the manuscript file URL (6"x9" .docx) for the interior
- Cover: use the PNG cover image
- Trim size: 6" x 9"
- The KDP Hardcover workflow has 3 pages: Hardcover Details → Hardcover Content → Hardcover Rights & Pricing`,
  };

  const systemPrompt = `You are an expert browser automation agent that uploads books to Amazon KDP (Kindle Direct Publishing).

You are currently uploading a book with the following details:
- Title: ${bookTitle}
- Format: ${format.toUpperCase()}
- Manuscript URL: ${bookData.manuscriptUrl ?? "not available"} (download and upload this file)
- Cover JPG URL: ${bookData.coverJpgUrl ?? "not available"}
- Cover PNG URL: ${bookData.coverPngUrl ?? "not available"}
${kdpDetails}

${formatGuidance[format] ?? ""}

You are on step ${stepNumber} of the upload process.

Previous actions taken:
${previousActions.slice(-5).join("\n") || "None yet"}

IMPORTANT RULES:
1. Respond with a JSON object describing exactly ONE action to take next
2. Be precise with selectors — prefer visible text labels, aria labels, or stable IDs
3. For file uploads: use upload_file with the URL as filepath — KDP accepts direct URL uploads in some fields, otherwise navigate to the URL first to trigger a download
4. If the upload is fully submitted and confirmed, set isComplete: true
5. If you encounter an unrecoverable error, set error: "description"
6. Never repeat the same action more than 3 times in a row — scroll or try an alternative approach instead

Respond ONLY with valid JSON in this exact format:
{
  "action": "click" | "type" | "scroll" | "navigate" | "wait" | "done" | "upload_file" | "select",
  "selector": "CSS selector or text content (for click/type/select/upload_file)",
  "text": "text to type (for type action)",
  "url": "URL to navigate to (for navigate action)",
  "milliseconds": 2000,
  "filepath": "local file path (for upload_file action)",
  "value": "option value (for select action)",
  "reasoning": "brief explanation of why this action",
  "isComplete": false,
  "error": null
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Screenshot,
            },
          },
          {
            type: "text",
            text: `Step ${stepNumber}: What is the next action to take to upload this ${format} book to KDP?\n\nCurrent page URL: ${page.url()}\n\nRespond only with the JSON action object.`,
          },
        ],
      },
    ],
    system: systemPrompt,
  });

  const textBlock = response.content.find((b: { type: string }) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from the response (handle markdown code blocks)
  let jsonText = textBlock.text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonText) as AgentAction;
  } catch {
    logger.warn({ text: textBlock.text, jobId }, "Failed to parse Claude JSON response");
    // Default to a wait action
    return {
      action: "wait",
      milliseconds: 2000,
      reasoning: "Parse error - waiting before retry",
    };
  }
}

async function executeAction(page: Page, action: AgentAction): Promise<void> {
  switch (action.action) {
    case "click":
      if (!action.selector) break;
      try {
        await page.click(action.selector, { timeout: 10000 });
      } catch {
        // Try text-based click as fallback
        await page.getByText(action.selector).first().click({ timeout: 5000 }).catch(() => {});
      }
      break;

    case "type":
      if (!action.selector || !action.text) break;
      try {
        await page.fill(action.selector, action.text, { timeout: 10000 });
      } catch {
        await page.locator(action.selector).first().fill(action.text).catch(() => {});
      }
      break;

    case "select":
      if (!action.selector || !action.value) break;
      await page.selectOption(action.selector, action.value, { timeout: 10000 }).catch(() => {});
      break;

    case "scroll":
      await page.evaluate(() => { (globalThis as unknown as { scrollBy: (x: number, y: number) => void }).scrollBy(0, 300); });
      break;

    case "navigate":
      if (!action.url) break;
      await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      break;

    case "upload_file":
      if (!action.selector || !action.filepath) break;
      await page.setInputFiles(action.selector, action.filepath, { timeout: 15000 }).catch(() => {});
      break;

    case "wait":
      await page.waitForTimeout(action.milliseconds ?? 2000);
      break;

    case "done":
      break;
  }

  // Always wait a bit after each action for the page to settle
  await page.waitForTimeout(1000);
}

export async function runUploadJob(jobId: number): Promise<void> {
  // Get job details
  const [job] = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Get book details
  const [book] = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, job.bookId))
    .limit(1);

  if (!book) {
    throw new Error(`Book ${job.bookId} not found`);
  }

  // Mark job as running
  await db
    .update(uploadJobsTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(uploadJobsTable.id, jobId));

  await addLog(jobId, "info", `Starting ${job.format} upload for: ${book.title}`);

  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    await addLog(jobId, "info", `Navigating to KDP dashboard`);
    await page.goto(KDP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    const screenshotUrl = await takeScreenshot(page, jobId, "initial");
    if (screenshotUrl) {
      await addLog(jobId, "info", `Browser ready — starting KDP navigation`, screenshotUrl);
      await db.update(uploadJobsTable).set({ lastScreenshotUrl: screenshotUrl }).where(eq(uploadJobsTable.id, jobId));
    }

    const bookData: Record<string, string | null> = {
      manuscriptUrl: book.manuscriptUrl,
      coverJpgUrl: book.coverJpgUrl,
      coverPngUrl: book.coverPngUrl,
      kdpContent: book.kdpContent,
    };

    const previousActions: string[] = [];
    let stepNumber = 0;
    let isComplete = false;

    while (stepNumber < MAX_STEPS && !isComplete) {
      stepNumber++;

      await addLog(jobId, "info", `Step ${stepNumber}: Asking Claude for next action`);

      let action: AgentAction;
      try {
        action = await askClaude(page, jobId, job.format, book.title, bookData, stepNumber, previousActions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await addLog(jobId, "warn", `Claude API error at step ${stepNumber}: ${msg} — retrying`);
        await page.waitForTimeout(3000);
        continue;
      }

      if (action.error) {
        throw new Error(`Agent error at step ${stepNumber}: ${action.error}`);
      }

      previousActions.push(`Step ${stepNumber}: ${action.action} — ${action.reasoning}`);
      await addLog(jobId, "info", `Step ${stepNumber}: ${action.action} — ${action.reasoning}`);

      if (action.isComplete || action.action === "done") {
        isComplete = true;
        break;
      }

      try {
        await executeAction(page, action);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await addLog(jobId, "warn", `Action execution warning at step ${stepNumber}: ${msg}`);
      }

      // Take a screenshot every 5 steps
      if (stepNumber % 5 === 0) {
        const ss = await takeScreenshot(page, jobId, `step-${stepNumber}`);
        if (ss) {
          await addLog(jobId, "info", `Progress snapshot at step ${stepNumber}`, ss);
          await db.update(uploadJobsTable).set({ lastScreenshotUrl: ss }).where(eq(uploadJobsTable.id, jobId));
        }
      }
    }

    if (!isComplete && stepNumber >= MAX_STEPS) {
      throw new Error(`Max steps (${MAX_STEPS}) reached without completing upload`);
    }

    // Final screenshot
    const finalScreenshot = await takeScreenshot(page, jobId, "complete");
    await db
      .update(uploadJobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        lastScreenshotUrl: finalScreenshot,
      })
      .where(eq(uploadJobsTable.id, jobId));

    await addLog(jobId, "success", `${job.format} upload completed successfully for: ${book.title}`, finalScreenshot ?? undefined);
    logger.info({ jobId, format: job.format, title: book.title }, "Upload job completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorScreenshot = await takeScreenshot(page, jobId, "error").catch(() => null);

    await db
      .update(uploadJobsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
        lastScreenshotUrl: errorScreenshot,
      })
      .where(eq(uploadJobsTable.id, jobId));

    await addLog(jobId, "error", `Upload failed: ${errorMessage}`, errorScreenshot ?? undefined);
    logger.error({ jobId, errorMessage }, "Upload job failed");
  } finally {
    await page.close();
  }
}
