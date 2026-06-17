/**
 * KDP Upload Agent Runner
 *
 * Implements the three master workflows (eBook, Paperback, Hardcover) using
 * Claude claude-sonnet-4-6 vision + Playwright browser automation. Every action follows
 * the capture → act → verify pattern from the 100-hour trained SOPs.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { askAi } from "./ai-provider";
import { db, uploadJobsTable, jobLogsTable, booksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { downloadBookAssets, type BookAssets } from "./asset-downloader";
import path from "path";
import fs from "fs";

// ─── Constants ───────────────────────────────────────────────────────────────

const KDP_URL = "https://kdp.amazon.com/en_US";
const MAX_STEPS = 150;
const SCREENSHOT_DIR = path.resolve(process.cwd(), "artifacts/api-server/uploads/screenshots");
const SOURCE_BASE = "https://scripturemadesimple.replit.app";

// Fixed values that never change across titles (from master workflow)
const FIXED = {
  author: "Noah Peterson",
  authorFirst: "Noah",
  authorLast: "Peterson",
  subtitle: "An Independent Companion Study Guide & Spiritual Formation Workbook",
  series: "The Reflective Reader",
  publishingRights: "I own the copyright and I hold necessary publishing rights",
  aiYes: "Yes",
  aiTexts: "Entire work, with extensive editing",
  aiTool: "custom AI",
  aiImages: "None",
  aiTranslations: "None",
  priceEbook: "2.99",
  pricePaperback: "9.99",
  priceHardcover: "19.999",
} as const;

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ─── Browser singleton ────────────────────────────────────────────────────────
//
// Two modes:
//
//  CDP mode (recommended for local use):
//    Set CDP_ENDPOINT=http://localhost:9222 and start Chrome with:
//      --remote-debugging-port=9222
//    Playwright attaches to the *existing* Chrome session, inheriting all
//    cookies and open tabs (KDP login, study guides, etc.).
//
//  Headless mode (Replit / CI):
//    No CDP_ENDPOINT set — a fresh headless Chromium is launched.
//    Requires a manual KDP login before any upload jobs run.

const CDP_ENDPOINT = process.env.CDP_ENDPOINT;

let browserInstance: Browser | null = null;
let browserContext: BrowserContext | null = null;

export async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!browserInstance || !browserInstance.isConnected()) {
    // Reset context whenever the browser instance is recreated
    browserContext = null;

    if (CDP_ENDPOINT) {
      // Attach to the user's running Chrome — inherits live KDP session, cookies, etc.
      logger.info({ cdpEndpoint: CDP_ENDPOINT }, "Connecting to existing Chrome via CDP");
      browserInstance = await chromium.connectOverCDP(CDP_ENDPOINT);
      logger.info("CDP connection established");
    } else {
      logger.info("Launching headless Playwright browser (CDP_ENDPOINT not set)");
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
          "--window-size=1280,900",
        ],
      });
    }
  }

  if (!browserContext) {
    if (CDP_ENDPOINT && browserInstance.contexts().length > 0) {
      // Reuse the default Chrome profile context — it holds all live session cookies
      browserContext = browserInstance.contexts()[0];
      logger.info(
        { openPages: browserContext.pages().length },
        "Reusing existing Chrome context (CDP mode)",
      );
    } else {
      browserContext = await browserInstance.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        acceptDownloads: true,
      });
    }

    browserContext.on("page", (p) => {
      logger.info({ url: p.url() }, "New page/tab opened in browser context");
    });
  }

  return { browser: browserInstance, context: browserContext };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

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
    const filename = `job-${jobId}-${Date.now()}-${stepName.replace(/[^a-z0-9_-]/gi, "_")}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    return `/api/screenshots/${filename}`;
  } catch (err) {
    logger.warn({ err, jobId, stepName }, "Screenshot failed");
    return null;
  }
}

// ─── Human-like interaction helpers ──────────────────────────────────────────

/** Random delay between min and max milliseconds */
function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/** Move mouse smoothly to element center, then click with a small random offset */
async function humanClick(page: Page, selectorOrCoords: string | { x: number; y: number }): Promise<void> {
  await page.waitForTimeout(randomDelay(200, 600));

  if (typeof selectorOrCoords === "object") {
    // Coordinate-based click (for Cover Creator canvas)
    const { x, y } = selectorOrCoords;
    await page.mouse.move(x + randomDelay(-3, 3), y + randomDelay(-3, 3), { steps: 8 });
    await page.waitForTimeout(randomDelay(150, 400));
    await page.mouse.click(x, y);
  } else {
    // Selector-based click
    let locator = page.locator(selectorOrCoords).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      // Fallback: try text-based locator
      locator = page.getByText(selectorOrCoords, { exact: false }).first();
    }
    try {
      const box = await locator.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2 + randomDelay(-4, 4);
        const cy = box.y + box.height / 2 + randomDelay(-4, 4);
        await page.mouse.move(cx, cy, { steps: 8 });
        await page.waitForTimeout(randomDelay(100, 300));
        await page.mouse.click(cx, cy);
      } else {
        await locator.click();
      }
    } catch {
      await locator.click({ force: true }).catch(() => {});
    }
  }

  await page.waitForTimeout(randomDelay(400, 900));
}

/** Triple-click to select all existing text, then type the new text with per-character delay */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForTimeout(randomDelay(200, 500));
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 8000 });

  // Triple-click to select all, then clear
  await locator.click({ clickCount: 3 });
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(100);

  // Type with human-like delays
  await locator.pressSequentially(text, { delay: randomDelay(40, 100) });
  await page.waitForTimeout(randomDelay(300, 600));
}

/**
 * For long text (description, back-cover text): use fill() which is equivalent
 * to the clipboard paste pattern from the SOP. After filling, we take a verify
 * screenshot to confirm the text landed correctly.
 */
async function humanPaste(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForTimeout(randomDelay(300, 700));
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 8000 });

  // Click to focus, select all, then fill (simulates clipboard paste)
  await locator.click({ clickCount: 3 });
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(150);
  await locator.fill(text);
  await page.waitForTimeout(randomDelay(400, 800));
}

/** Intercept file chooser dialog and set the given local file */
async function handleFileUpload(page: Page, triggerSelector: string, filePath: string): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
  await humanClick(page, triggerSelector);
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(randomDelay(500, 1200));
}

/** Select a dropdown option by visible text or value */
async function humanSelect(page: Page, selector: string, optionText: string): Promise<void> {
  await page.waitForTimeout(randomDelay(200, 500));
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 8000 });
  try {
    await locator.selectOption({ label: optionText });
  } catch {
    try {
      await locator.selectOption({ value: optionText });
    } catch {
      await locator.selectOption(optionText).catch(() => {});
    }
  }
  await page.waitForTimeout(randomDelay(300, 600));
}

// ─── Action types ─────────────────────────────────────────────────────────────

interface AgentAction {
  action:
    | "click"             // click element by selector/label or coordinates
    | "type"              // short text fields: type char-by-char
    | "paste"             // long text: fill (clipboard-paste equivalent)
    | "file_upload"       // intercept file chooser then set local file
    | "keyboard"          // press keyboard key/combo
    | "select"            // select dropdown option
    | "scroll"            // scroll page
    | "navigate"          // navigate to URL
    | "wait"              // explicit wait
    | "screenshot_verify" // take screenshot only (for verification pause)
    | "done"              // upload complete for this format
    | "stop_notify";      // requires human intervention — stop and log

  // Element targeting
  selector?: string;
  label_text?: string;
  coordinates?: { x: number; y: number };

  // Content
  text?: string;
  file_path?: string;
  key?: string;
  option?: string;

  // Navigation / wait
  url?: string;
  ms?: number;

  // Scroll
  scroll_direction?: "down" | "up" | "bottom" | "top";
  scroll_amount?: number;

  // Metadata
  reasoning: string;
  verify_after?: string;

  // Terminal states
  is_complete?: boolean;
  stop_reason?: string;
}

// ─── System prompt builder ────────────────────────────────────────────────────

interface KdpContent {
  description?: string;
  categories?: string;
  keywords?: string;
  series_summary?: string;
  back_cover_description?: string;
}

function buildSystemPrompt(
  format: string,
  bookTitle: string,
  kdp: KdpContent,
  assets: BookAssets,
): string {
  const universalRules = `
## YOUR IDENTITY
You are the KDP_ORCHESTRATOR — an expert KDP upload automation agent running inside a headless Playwright browser on a Linux server.
The browser already has an active, logged-in Amazon KDP session.
You are uploading a real book and every action executes live against Amazon KDP.

## ABSOLUTE RULES (ALL FORMATS)
1. **Capture → Act → Verify**: Every action must be followed by a screenshot verification. Never assume an action succeeded from its return value alone.
2. **Vision-verified paste gate (NON-NEGOTIABLE)**: After EVERY paste/type operation (title, subtitle, author, description, series, back-cover text, price, AI tool field, etc.), the NEXT action must be a screenshot_verify action to confirm the EXACT expected text is visibly rendered in the correct KDP field. If the text is wrong/missing, repeat the paste before advancing.
3. **Yellow-outlined KDP box**: Read the text inside it. Do exactly what it says. Click any checkbox it contains. Do NOT proceed past it without satisfying it.
4. **Red-outlined KDP box**: This is a critical error. Stop, fix the affected section, and verify the red box is gone before proceeding.
5. **"There was an error processing your files" modal**: Click its Continue button, then scroll and inspect all red boxes.
6. **Author is ALWAYS "Noah Peterson"** — first name "Noah", last name "Peterson". Never use the original book author.
7. **Subtitle is ALWAYS**: "An Independent Companion Study Guide & Spiritual Formation Workbook" (with ampersand)
8. **Series is ALWAYS**: "The Reflective Reader"
9. **AI-Generated Content answers** (same for all formats):
   - Yes selected
   - Texts: "Entire work, with extensive editing"
   - AI Tool textbox: "custom AI"
   - Images: "None"
   - Translations: "None"
10. If KDP is logged out or shows a login/2FA/account prompt: use stop_notify immediately.
11. Respond with exactly ONE action per turn. Do not skip steps.

## THIS TITLE'S DATA
- **Title**: ${bookTitle}
- **Subtitle** (fixed, always): ${FIXED.subtitle}
- **Author** (fixed, always): ${FIXED.author} (first: Noah, last: Peterson)
- **Series** (fixed, always): ${FIXED.series}
- **Description**: ${kdp.description ?? "(not available — use stop_notify if description is required)"}
- **Categories** (exactly 3):
${kdp.categories ?? "(not available)"}
- **Keywords** (7, one per field):
${kdp.keywords ?? "(not available)"}
- **Series Summary (back-cover top-right)**: ${kdp.series_summary ?? "(not available)"}
- **Back Cover Description (back-cover center)**: ${kdp.back_cover_description ?? "(not available)"}

## LOCAL ASSET PATHS
- **Manuscript** (6x9 DOCX): ${assets.manuscriptReady ? assets.manuscriptPath : "NOT DOWNLOADED — stop_notify"}
- **Cover PNG** (for Cover Creator): ${assets.coverPngReady ? assets.coverPngPath : "NOT DOWNLOADED"}
- **Cover JPG** (for Kindle cover and back-cover image slot): ${assets.coverJpgReady ? assets.coverJpgPath : "NOT DOWNLOADED"}
`;

  const ebookWorkflow = `
## FORMAT: Kindle eBook
Price: $2.99 USD | Royalty: 70% | Enroll KDP Select

### START CONDITION
- From Bookshelf: click the "Create" button (top-right or center of page) → select "Kindle eBook"
- VISION VERIFY: page shows Kindle eBook Details form with progress tracker (Details → Content → Pricing)

### PAGE 1 — KINDLE DETAILS (complete in strict section order)
Complete each section in this EXACT order, vision-verify after each one before moving to the next:

1. **Language**: Set to English
2. **Book Title**: Paste exact title → VISION VERIFY title is in field
3. **Subtitle**: Paste "${FIXED.subtitle}" → VISION VERIFY subtitle with ampersand is in field
4. **Series (DO NOT SKIP)**: Click Series field, add "${FIXED.series}" → VISION VERIFY series is populated
5. **Author**: Enter first="${FIXED.authorFirst}" last="${FIXED.authorLast}" → VISION VERIFY both name fields
6. **Description**: Paste exact description from book data above → VISION VERIFY text is visible in editor
7. **Publishing Rights**: Select "I own the copyright and I hold necessary publishing rights"
8. **Primary Audience**: Select "No" for sexually explicit content — do NOT touch reading-age fields
9. **Categories**: Add exactly 3 categories using the book's category list above, navigate the tree
10. **Keywords**: Fill all 7 keyword fields
11. **PAGE 1 GATE**: Before clicking Save and Continue, take full-page screenshot and verify all 10 sections complete → then click Save and Continue → VISION VERIFY URL moved to /content

### PAGE 2 — KINDLE CONTENT
1. **Manuscript**: Upload ${assets.manuscriptPath} → VISION VERIFY "uploaded successfully" message
2. **Kindle Cover**: Upload cover JPG (${assets.coverJpgPath}) → VISION VERIFY cover thumbnail visible; if Cover Creator auto-overlays title/author text on top of finished artwork, remove those overlaid text boxes
3. **AI-Generated Content**: Select Yes → Texts="Entire work, with extensive editing" → AI Tool="custom AI" → Images="None" → Translations="None" → VISION VERIFY all fields
4. **PAGE 2 GATE**: Full-page screenshot verify all content complete → click Save and Continue → VISION VERIFY URL moved to /pricing

### PAGE 3 — KINDLE PRICING
1. **KDP Select**: Enroll/check KDP Select → VISION VERIFY enrolled
2. **Territories**: Select "All territories (worldwide rights)" → VISION VERIFY
3. **Primary Marketplace**: Confirm Amazon.com → VISION VERIFY
4. **Royalty**: Select 70% → VISION VERIFY
5. **Price**: Enter 2.99 in Amazon.com USD field → VISION VERIFY "2.99" visible in field
6. **Amazon checkbox**: If enabled Amazon checkbox exists, click it → VISION VERIFY checked
7. **PAGE 3 GATE**: Full-page screenshot, verify all pricing gates pass, then click "Publish Your Kindle eBook"
8. **SUCCESS VERIFY**: VISION VERIFY confirmation shows "Congratulations!" + "Your Kindle eBook has been submitted" + correct title + "By Noah Peterson" + "$2.99"
`;

  const paperbackWorkflow = `
## FORMAT: Paperback
Price: $9.99 USD | Royalty: 60% | Expanded Distribution enabled

### START CONDITION
- If starting from the Kindle success screen: click "Start your paperback now"
- If starting from Bookshelf: locate same title row → start/resume Paperback setup

### PAGE 1 — PAPERBACK DETAILS
Paperback details are usually carried over from the eBook. Preserve all carried-over fields unless KDP shows validation error.
1. **Verify (do not re-enter unless error)**: Title, Subtitle="${FIXED.subtitle}", Author="${FIXED.author}", Description, Series="${FIXED.series}"
2. **Categories**: Verify exactly 3 categories are shown — correct if needed (same as eBook categories)
3. **PAGE 1 GATE**: Full-page screenshot verify all fields correct → click Save and Continue → VISION VERIFY moved to Paperback Content

### PAGE 2 — PAPERBACK CONTENT
1. **ISBN**: Choose free KDP ISBN → click "Assign ISBN" → VISION VERIFY ISBN assigned, imprint "Independently published"
2. **Print Options**: Leave ALL options exactly as KDP defaults (Black & white, white paper, no bleed, 6x9, matte) — DO NOT change anything
3. **Manuscript**: Upload ${assets.manuscriptPath} → VISION VERIFY "Manuscript uploaded successfully!"
4. **Cover Creator — Start**:
   - Click "Launch Cover Creator"
   - If help overlay appears: check "Don't show again" if present, click Continue
   - Click "From My Computer" → upload ${assets.coverPngPath}
   - After design gallery loads: choose the **TRUE TOP-LEFT design thumbnail** (first thumbnail at upper-left of the grid)
   - If Quick Tutorial overlay appears: click Dismiss
   - VISION VERIFY: workspace shows full-wrap layout (back cover left, spine middle, front cover right)
5. **Cover Creator — Back Cover Image**:
   - Click the small top-left image slot on the back cover
   - If image-edit popup: click "Choose a new cover image" / "Choose new image"
   - Click "From My Computer" → upload ${assets.coverJpgPath}
   - VISION VERIFY: JPG thumbnail appears in the top-left back-cover image slot
6. **Cover Creator — Back Cover Top-Right Text**:
   - Click the top-right text box on the back cover
   - Select all placeholder text → paste ONLY the Series Summary text (from book data above)
   - VISION VERIFY: top-right box shows Series Summary text, not placeholder
7. **Cover Creator — Back Cover Center Text**:
   - Click the middle/center text box on the back cover
   - Select all → paste ONLY the Back Cover Description text (from book data above, do NOT mix with Series Summary)
   - VISION VERIFY: center box shows Back Cover Description text
8. **Cover Creator — Spine**: If Cover Creator shows "spine not thick enough" error: delete both spine text boxes (title + author). Otherwise leave spine text as-is.
9. **Cover Creator — Save & Submit**:
   - Click Preview button, verify cover looks correct
   - Click "Save & Submit"
   - VISION VERIFY: returned to Paperback Content page with "Cover uploaded successfully!"
10. **AI-Generated Content**: Yes → Texts="Entire work, with extensive editing" → Tool="custom AI" → Images="None" → Translations="None" → VISION VERIFY all fields
11. **Print Previewer**:
    - Click "Launch Previewer" (in Book Preview section)
    - Wait for Print Previewer tab to load
    - Review any flagged issues; TOC non-printable-markup warning is not a blocker — inspect the page visually
    - Spot-check first flagged page, last pages, and Cover page
    - Click the yellow "Approve" button after visual check passes
    - VISION VERIFY: returned to Paperback Content with URL containing "acceptProof=CONVERTED"
12. **PAGE 2 GATE**: Full-page screenshot verify ISBN, print options default, manuscript uploaded, cover done, AI content done, previewer approved → click Save and Continue → VISION VERIFY moved to Pricing

### PAGE 3 — PAPERBACK RIGHTS & PRICING
1. **Territories**: "All territories (worldwide rights)"
2. **Primary Marketplace**: Amazon.com
3. **Price**: Enter 9.99 in Amazon.com USD field → VISION VERIFY "9.99" in field
4. **Pricing fix**: If red "Please enter a price" warnings appear for derived marketplaces — click into Amazon.com price field, select all, type 9.99, press Tab — this commits the value and clears red errors
5. **Expanded Distribution**: Enable Expanded Distribution → VISION VERIFY enabled
6. **Amazon checkbox**: If enabled Amazon checkbox exists, click it
7. **PAGE 3 GATE**: Verify "Publish Your Paperback Book" button is enabled and all checks pass → click it
8. **SUCCESS VERIFY**: VISION VERIFY "Your paperback has been submitted" + correct title + "By Noah Peterson"
`;

  const hardcoverWorkflow = `
## FORMAT: Hardcover
Price: $19.999 USD (use 19.999 not 19.99 — avoids derived marketplace validation errors)

### START CONDITION
- From Bookshelf: locate same title row → click "+ Create hardcover" (or "Continue setup" if draft exists)
- VISION VERIFY: page is Hardcover Details, progress tracker shows Hardcover Details → Content → Pricing

### PAGE 1 — HARDCOVER DETAILS
Details are usually carried over from paperback/eBook. Preserve unless KDP shows validation error.
1. **Verify**: Language=English, Title=correct, Subtitle="${FIXED.subtitle}", Series="${FIXED.series}", Author="${FIXED.author}", Publishing Rights, Primary Audience=No adult content
2. **Categories**: Verify exactly 3 categories shown, Keywords all 7 populated
3. **Do NOT touch reading-age fields**
4. **PAGE 1 GATE**: Full-page screenshot verify all fields → click Save and Continue → VISION VERIFY moved to Hardcover Content

### PAGE 2 — HARDCOVER CONTENT
1. **ISBN**: Choose free KDP ISBN → click "Assign ISBN" → if confirmation modal appears click "Assign ISBN" → VISION VERIFY ISBN assigned
2. **Print Options**: Leave ALL defaults unchanged (Black & white, white paper, no bleed, 6x9, matte)
3. **Manuscript**: Click "Upload manuscript" → upload ${assets.manuscriptPath} → VISION VERIFY "Manuscript uploaded successfully!"
4. **Cover Creator — Start**:
   - In Book Cover, click "Launch Cover Creator" / Cover Creator
   - Upload ${assets.coverPngPath} when prompted
   - Proceed to design gallery
5. **Cover Creator — Design Selection (CRITICAL)**:
   - Always choose the **TRUE TOP-LEFT thumbnail** (first design at upper-left of the grid as seen by a human at the keyboard)
   - Cover Creator coordinate pitfall: cua-driver window-relative coords put the true top-left thumbnail at around x≈137, y≈300-330 in the Chrome window — NOT at x≈610 which is the top-right thumbnail
   - Using page coordinates (not full-screen): the top-left thumbnail is the FIRST one in the grid, leftmost
   - VISION VERIFY: workspace shows full-wrap layout (back cover left, spine middle, front cover right)
   - If wrong design selected: click "Start Over" → confirm → design grid → choose true top-left again
6. **Cover Creator — Back Cover Image**:
   - Click the small top-left image slot on the back cover
   - Upload ${assets.coverJpgPath}
   - VISION VERIFY: JPG thumbnail in top-left back-cover image slot
7. **Cover Creator — Back Cover Top-Right Text**:
   - Click the top-right text box on the back cover (to the right of the small JPG image, higher position)
   - Select all → paste ONLY the Series Summary text (from book data above)
   - VISION VERIFY: top-right box shows Series Summary text
8. **Cover Creator — Back Cover Center Text**:
   - Click the middle/center text box (large body text area)
   - Select all → paste ONLY the Back Cover Description text (from book data above)
   - VISION VERIFY: center box shows description text
   - **If a text box is polluted (wrong text mixed in)**: click inside it, select all, delete, verify empty, then paste correct text
9. **Cover Creator — Front Cover and Spine Checks**:
   - Verify front cover title/subtitle/tagline are visually centered within the red boundary lines
   - Verify spine title and author are centered within the red dotted spine guide and not cut off
   - If spine text is too large or clipped: reduce font size or apply Auto Fit
10. **Cover Creator — Preview, Save & Submit**:
    - Click Preview button, re-check visual centering in preview
    - Click "Save & Submit"
    - VISION VERIFY: returned to Hardcover Content page
11. **Print Previewer**:
    - In Book Preview section, click "Launch Previewer"
    - Wait for Print Previewer tab to load
    - Review issues — TOC non-printable-markup warning: inspect the TOC page visually; if it looks correct inside safe margins, it is not a blocker
    - Click the yellow "Approve" button after visual check passes
    - VISION VERIFY: returned to Hardcover Content
12. **AI-Generated Content**: Yes → Texts="Entire work, with extensive editing" → Tool="custom ai" → Images="None" → Translations="None" → VISION VERIFY
13. **PAGE 2 GATE**: Full-page screenshot verify all complete → click Save and Continue → VISION VERIFY moved to Pricing

### PAGE 3 — HARDCOVER RIGHTS & PRICING
1. **Territories**: "All territories (worldwide rights)"
2. **Primary Marketplace**: Amazon.com
3. **Price**: Enter 19.999 in Amazon.com USD field (KDP may display as "$20.00 USD" — that is correct)
   → VISION VERIFY the field accepted 19.999 and red validation errors cleared
4. **Pricing fix**: If red "Please enter a price" errors remain, set price to "19.99999" instead — this also clears validation
5. **Expanded Distribution**: Enable if available
6. **Amazon checkbox**: If enabled Amazon checkbox exists, click it
7. **PAGE 3 GATE**: Full-page screenshot, verify all pricing gates pass, "Publish Your Hardcover Book" is enabled → click it
8. **Done modal**: After publish, KDP shows confirmation modal — click "Done" button
9. **SUCCESS VERIFY**: VISION VERIFY "Your hardcover has been submitted" + correct title + "By Noah Peterson", then Bookshelf visible
`;

  const formatWorkflow =
    format === "ebook" ? ebookWorkflow : format === "paperback" ? paperbackWorkflow : hardcoverWorkflow;

  return `${universalRules}

${formatWorkflow}

## RESPONSE FORMAT
Respond with EXACTLY ONE JSON action object (no markdown, no prose, raw JSON only):

{
  "action": "click|type|paste|file_upload|keyboard|select|scroll|navigate|wait|screenshot_verify|done|stop_notify",
  "selector": "CSS selector (for click/type/paste/file_upload/select/keyboard target)",
  "label_text": "visible button/link text to click (alternative to selector)",
  "coordinates": {"x": 0, "y": 0},
  "text": "text to enter (for type/paste actions)",
  "file_path": "absolute local path (for file_upload)",
  "key": "Tab|Enter|Control+a|Escape|etc (for keyboard action)",
  "option": "option label or value (for select action)",
  "url": "https://... (for navigate action)",
  "ms": 2000,
  "scroll_direction": "down|up|bottom|top",
  "scroll_amount": 300,
  "reasoning": "brief explanation of what this step accomplishes",
  "verify_after": "describe what you expect to see after this action",
  "is_complete": false,
  "stop_reason": "reason requiring human intervention (for stop_notify only)"
}
`;
}

// ─── Claude vision interaction ────────────────────────────────────────────────

async function askClaude(
  screenshotBase64: string,
  systemPrompt: string,
  userMessage: string,
): Promise<AgentAction> {
  let raw = await askAi(screenshotBase64, systemPrompt, userMessage);
  raw = raw.trim();

  // Strip any markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();
  // Extract first JSON object if wrapped
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) raw = objMatch[0];

  try {
    return JSON.parse(raw) as AgentAction;
  } catch {
    logger.warn({ raw }, "Failed to parse AI JSON — defaulting to wait");
    return { action: "wait", ms: 2000, reasoning: "JSON parse error — waiting" };
  }
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  page: Page,
  action: AgentAction,
  context: BrowserContext,
): Promise<{ activePage: Page }> {
  let activePage = page;

  switch (action.action) {
    case "click": {
      const target = action.coordinates ?? action.selector ?? action.label_text;
      if (!target) break;
      if (typeof target === "object") {
        await humanClick(activePage, target as { x: number; y: number });
      } else {
        await humanClick(activePage, target);
      }
      break;
    }

    case "type": {
      const sel = action.selector ?? action.label_text;
      if (!sel || !action.text) break;
      await humanType(activePage, sel, action.text);
      break;
    }

    case "paste": {
      const sel = action.selector ?? action.label_text;
      if (!sel || !action.text) break;
      await humanPaste(activePage, sel, action.text);
      break;
    }

    case "file_upload": {
      const trigger = action.selector ?? action.label_text;
      const fp = action.file_path;
      if (!trigger || !fp) break;
      // Check if file exists
      if (!fs.existsSync(fp)) {
        logger.warn({ fp }, "File upload: file does not exist");
        break;
      }
      try {
        await handleFileUpload(activePage, trigger, fp);
      } catch {
        // Fallback: try setInputFiles directly on input element
        await activePage.setInputFiles("input[type=file]", fp, { timeout: 15000 }).catch(() => {});
      }
      break;
    }

    case "keyboard": {
      if (!action.key) break;
      await activePage.waitForTimeout(randomDelay(200, 400));
      await activePage.keyboard.press(action.key);
      await activePage.waitForTimeout(randomDelay(300, 600));
      break;
    }

    case "select": {
      const sel = action.selector ?? action.label_text;
      if (!sel || !action.option) break;
      await humanSelect(activePage, sel, action.option);
      break;
    }

    case "scroll": {
      const dir = action.scroll_direction ?? "down";
      const amt = action.scroll_amount ?? 400;
      await activePage.waitForTimeout(randomDelay(200, 400));
      if (dir === "bottom") {
        await activePage.evaluate(() => {
          const w = globalThis as unknown as { scrollTo: (x: number, y: number) => void; document: { body: { scrollHeight: number } } };
          w.scrollTo(0, w.document.body.scrollHeight);
        });
      } else if (dir === "top") {
        await activePage.evaluate(() => {
          (globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 0);
        });
      } else {
        const scrollAmt = dir === "down" ? amt : -amt;
        await activePage.evaluate((a: number) => {
          (globalThis as unknown as { scrollBy: (opts: { top: number; behavior: string }) => void }).scrollBy({ top: a, behavior: "smooth" });
        }, scrollAmt);
      }
      await activePage.waitForTimeout(randomDelay(300, 700));
      break;
    }

    case "navigate": {
      if (!action.url) break;
      await activePage.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await activePage.waitForTimeout(randomDelay(800, 1500));
      break;
    }

    case "wait": {
      await activePage.waitForTimeout(action.ms ?? 2000);
      break;
    }

    case "screenshot_verify": {
      // No action — caller will take screenshot and pass to Claude for verification
      await activePage.waitForTimeout(randomDelay(300, 600));
      break;
    }

    case "done":
    case "stop_notify":
      break;
  }

  // After any action, check if a new page/tab opened (e.g. Print Previewer)
  // and switch to it if it's the most recently opened page
  const pages = context.pages();
  if (pages.length > 1) {
    // Use the last opened page as the active one
    const newestPage = pages[pages.length - 1];
    if (newestPage !== activePage && !newestPage.isClosed()) {
      // Wait briefly for the new page to load
      await newestPage.waitForLoadState("domcontentloaded").catch(() => {});
      activePage = newestPage;
    }
  }

  return { activePage };
}

// ─── Main job runner ──────────────────────────────────────────────────────────

export async function runUploadJob(jobId: number): Promise<void> {
  // 1. Load job + book
  const [job] = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.id, jobId))
    .limit(1);

  if (!job) throw new Error(`Job ${jobId} not found`);

  const [book] = await db
    .select()
    .from(booksTable)
    .where(eq(booksTable.id, job.bookId))
    .limit(1);

  if (!book) throw new Error(`Book ${job.bookId} not found`);

  // 2. Mark running
  await db
    .update(uploadJobsTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(uploadJobsTable.id, jobId));

  await addLog(jobId, "info", `Starting ${job.format} upload for: "${book.title}"`);

  // 3. Parse KDP content
  let kdpContent: KdpContent = {};
  if (book.kdpContent) {
    try {
      kdpContent = JSON.parse(book.kdpContent) as KdpContent;
    } catch {
      await addLog(jobId, "warn", "Could not parse kdpContent JSON — proceeding without AI-generated content data");
    }
  }

  // 4. Download assets — extract studyId from existing URL fields
  await addLog(jobId, "info", "Downloading book assets (manuscript, cover.png, cover.jpg)");
  let studyId: string | null = null;
  if (book.manuscriptUrl) {
    const m = book.manuscriptUrl.match(/\/download\/([^/]+)\//);
    if (m) studyId = m[1];
  }
  if (!studyId && book.coverPngUrl) {
    const m = book.coverPngUrl.match(/\/download-uploaded-cover\/([^/]+)\//);
    if (m) studyId = m[1];
  }

  const assets = await downloadBookAssets(
    book.id,
    book.manuscriptUrl ?? (studyId ? `${SOURCE_BASE}/download/${studyId}/6x9` : null),
    book.coverPngUrl ?? (studyId ? `${SOURCE_BASE}/download-uploaded-cover/${studyId}/png` : null),
    book.coverJpgUrl ?? (studyId ? `${SOURCE_BASE}/download-uploaded-cover/${studyId}/jpg` : null),
  );

  await addLog(
    jobId,
    assets.manuscriptReady && assets.coverPngReady && assets.coverJpgReady ? "info" : "warn",
    `Assets: manuscript=${assets.manuscriptReady}, coverPng=${assets.coverPngReady}, coverJpg=${assets.coverJpgReady}`,
  );

  if (!assets.manuscriptReady) {
    const msg = "Manuscript download failed — cannot proceed with upload";
    await db.update(uploadJobsTable).set({ status: "failed", errorMessage: msg, completedAt: new Date() }).where(eq(uploadJobsTable.id, jobId));
    await addLog(jobId, "error", msg);
    return;
  }

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt(job.format, book.title, kdpContent, assets);

  // 6. Get browser
  const { context } = await getBrowser();

  // Reuse existing KDP tab if one is open, otherwise open a new one
  const allPages = context.pages();
  const existingKdpPage = allPages.find((p) => p.url().includes("kdp.amazon.com"));
  let page = existingKdpPage ?? await context.newPage();

  try {
    // 7. Navigate to KDP bookshelf — the correct starting point for all formats.
    //    The system prompt for each format instructs the agent how to proceed from here
    //    (e.g. "Create new title" for ebook/paperback, "+ Create hardcover" for hardcover).
    await addLog(jobId, "info", existingKdpPage ? "Reusing existing KDP tab" : "Opening new KDP tab");
    await page.goto(`${KDP_URL}/bookshelf`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(randomDelay(1000, 2000));

    let ssUrl = await takeScreenshot(page, jobId, "start");
    if (ssUrl) {
      await addLog(jobId, "info", "Browser ready at KDP — beginning upload workflow", ssUrl);
      await db.update(uploadJobsTable).set({ lastScreenshotUrl: ssUrl }).where(eq(uploadJobsTable.id, jobId));
    }

    // 8. Main agent loop
    const previousActions: string[] = [];
    let stepNumber = 0;
    let isComplete = false;
    let isStopped = false;

    while (stepNumber < MAX_STEPS && !isComplete && !isStopped) {
      stepNumber++;

      // Take screenshot for this step
      const screenshotBuf = await page.screenshot({ fullPage: false }).catch(() => null);
      if (!screenshotBuf) {
        await addLog(jobId, "warn", `Step ${stepNumber}: Could not take screenshot — waiting`);
        await page.waitForTimeout(3000);
        continue;
      }
      const base64 = screenshotBuf.toString("base64");

      // Save screenshot to disk and DB every step
      const stepSsUrl = await takeScreenshot(page, jobId, `step-${stepNumber}`);
      if (stepSsUrl) {
        await db.update(uploadJobsTable).set({ lastScreenshotUrl: stepSsUrl }).where(eq(uploadJobsTable.id, jobId));
      }

      // Build user message for Claude
      const userMsg = [
        `Step ${stepNumber} of max ${MAX_STEPS}.`,
        `Current URL: ${page.url()}`,
        `Format: ${job.format.toUpperCase()}`,
        `Book: "${book.title}"`,
        `\nPrevious ${Math.min(8, previousActions.length)} actions:`,
        ...previousActions.slice(-8).map((a, i) => `  ${i + 1}. ${a}`),
        `\nLooking at this screenshot, what is the SINGLE next action to take?`,
        `Respond with raw JSON only.`,
      ].join("\n");

      let action: AgentAction;
      try {
        action = await askClaude(base64, systemPrompt, userMsg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await addLog(jobId, "warn", `Step ${stepNumber}: Claude API error: ${msg} — waiting 5s`);
        await page.waitForTimeout(5000);
        continue;
      }

      // Record action
      const actionDesc = `${action.action}${action.selector ? ` [${action.selector}]` : ""}${action.label_text ? ` [text: "${action.label_text}"]` : ""}${action.text ? ` "${action.text.slice(0, 60)}${action.text.length > 60 ? "..." : ""}"` : ""} — ${action.reasoning}`;
      previousActions.push(`Step ${stepNumber}: ${actionDesc}`);

      await addLog(jobId, "info", `Step ${stepNumber}: ${action.action} — ${action.reasoning}`, stepSsUrl ?? undefined);

      logger.info({ jobId, step: stepNumber, action: action.action, reasoning: action.reasoning }, "Agent action");

      // Handle terminal states
      if (action.action === "done" || action.is_complete) {
        isComplete = true;
        break;
      }

      if (action.action === "stop_notify") {
        isStopped = true;
        const reason = action.stop_reason ?? "Agent requested human intervention";
        await addLog(jobId, "warn", `⚠️ HUMAN INTERVENTION REQUIRED: ${reason}`, stepSsUrl ?? undefined);
        throw new Error(`Agent stopped: ${reason}`);
      }

      // Execute action
      try {
        const result = await executeAction(page, action, context);
        page = result.activePage; // may have changed to new tab (Print Previewer)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await addLog(jobId, "warn", `Step ${stepNumber} execution warning: ${msg}`);
      }

      // Auto-log verify_after hint if provided
      if (action.verify_after) {
        await addLog(jobId, "info", `  → Verifying: ${action.verify_after}`);
      }
    }

    if (!isComplete && stepNumber >= MAX_STEPS) {
      throw new Error(`Max steps (${MAX_STEPS}) reached without completing ${job.format} upload`);
    }

    // 9. Final screenshot and success
    const finalSsUrl = await takeScreenshot(page, jobId, "complete");
    await db
      .update(uploadJobsTable)
      .set({ status: "completed", completedAt: new Date(), lastScreenshotUrl: finalSsUrl })
      .where(eq(uploadJobsTable.id, jobId));

    await addLog(
      jobId,
      "success",
      `✅ ${job.format} upload completed successfully for: "${book.title}"`,
      finalSsUrl ?? undefined,
    );
    logger.info({ jobId, format: job.format, title: book.title }, "Upload job completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorSsUrl = await takeScreenshot(page, jobId, "error").catch(() => null);

    await db
      .update(uploadJobsTable)
      .set({ status: "failed", completedAt: new Date(), errorMessage, lastScreenshotUrl: errorSsUrl })
      .where(eq(uploadJobsTable.id, jobId));

    await addLog(jobId, "error", `❌ Upload failed: ${errorMessage}`, errorSsUrl ?? undefined);
    logger.error({ jobId, errorMessage, format: job.format }, "Upload job failed");
  } finally {
    await page.close().catch(() => {});
  }
}
