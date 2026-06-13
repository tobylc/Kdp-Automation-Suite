/**
 * Local workspace setup helpers
 *
 * When the app runs on the user's local machine with CDP_ENDPOINT set, this
 * module can:
 *   1. Check whether Chrome is running with remote debugging enabled.
 *   2. Launch Chrome with the required flags if it is not running.
 *   3. Open the KDP Bookshelf and Study Guides tabs if they are not open.
 *
 * All Chrome interactions use the lightweight CDP REST API (HTTP GETs) rather
 * than Playwright, so the upload browser context is never disturbed.
 */

import { exec } from "child_process";
import os from "os";
import path from "path";
import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

const CDP_ENDPOINT = process.env["CDP_ENDPOINT"] ?? null;

function getCdpBase(): string {
  if (!CDP_ENDPOINT) return "http://localhost:9222";
  try {
    const u = new URL(CDP_ENDPOINT);
    return `http://localhost:${u.port || "9222"}`;
  } catch {
    return "http://localhost:9222";
  }
}

function getCdpPort(): string {
  try {
    return new URL(getCdpBase()).port || "9222";
  } catch {
    return "9222";
  }
}

const USER_DATA_DIR =
  process.env["CHROME_USER_DATA_DIR"] ??
  path.join(os.homedir(), "chrome-kdp-profile");

const KDP_URL = "https://kdp.amazon.com/en_US/bookshelf";
const STUDY_GUIDES_URL = "https://scripturemadesimple.replit.app/my-studies";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SetupStatus {
  localMode: boolean;
  chromeCdpAvailable: boolean;
  kdpTabOpen: boolean;
  kdpLoggedIn: boolean;
  studyGuidesTabOpen: boolean;
  isReady: boolean;
  cdpEndpoint: string | null;
}

export interface SetupStep {
  name: string;
  status: "ok" | "error" | "skipped";
  message: string;
}

export interface SetupResult {
  steps: SetupStep[];
  isReady: boolean;
  message: string;
}

// ─── CDP REST helpers ─────────────────────────────────────────────────────────

interface CdpPage {
  id: string;
  url: string;
  title: string;
  type: string;
}

async function cdpGet(endpoint: string): Promise<Response> {
  return fetch(`${getCdpBase()}${endpoint}`, {
    signal: AbortSignal.timeout(3_000),
  });
}

async function isCdpAvailable(): Promise<boolean> {
  try {
    const res = await cdpGet("/json/version");
    return res.ok;
  } catch {
    return false;
  }
}

async function getCdpPages(): Promise<CdpPage[]> {
  try {
    const res = await cdpGet("/json");
    if (!res.ok) return [];
    const all = (await res.json()) as CdpPage[];
    return all.filter((p) => p.type === "page");
  } catch {
    return [];
  }
}

/** Open a new tab in Chrome via the CDP REST API. Returns true on success. */
async function openCdpTab(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${getCdpBase()}/json/new?${url}`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Chrome launcher ──────────────────────────────────────────────────────────

function buildLaunchCommand(): string {
  const port = getCdpPort();
  const dataDir = USER_DATA_DIR;
  const platform = os.platform();

  if (platform === "darwin") {
    return (
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` +
      ` --remote-debugging-port=${port}` +
      ` --user-data-dir="${dataDir}"` +
      ` --no-first-run 2>/dev/null &`
    );
  }

  if (platform === "win32") {
    const paths = [
      `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`,
      `C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    return (
      `start /b "" "${paths[0]}"` +
      ` --remote-debugging-port=${port}` +
      ` --user-data-dir="${dataDir}"`
    );
  }

  // Linux — try common binary names
  return (
    `(google-chrome || google-chrome-stable || chromium-browser || chromium)` +
    ` --remote-debugging-port=${port}` +
    ` --user-data-dir="${dataDir}"` +
    ` --no-first-run &`
  );
}

async function launchChrome(): Promise<void> {
  const cmd = buildLaunchCommand();
  logger.info({ cmd }, "Launching Chrome with remote debugging");
  return new Promise((resolve) => {
    exec(cmd, () => resolve());
  });
}

async function waitForCdp(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpAvailable()) return true;
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSetupStatus(): Promise<SetupStatus> {
  const localMode = CDP_ENDPOINT !== null;

  if (!localMode) {
    return {
      localMode: false,
      chromeCdpAvailable: false,
      kdpTabOpen: false,
      kdpLoggedIn: false,
      studyGuidesTabOpen: false,
      isReady: false,
      cdpEndpoint: null,
    };
  }

  const chromeCdpAvailable = await isCdpAvailable();

  if (!chromeCdpAvailable) {
    return {
      localMode: true,
      chromeCdpAvailable: false,
      kdpTabOpen: false,
      kdpLoggedIn: false,
      studyGuidesTabOpen: false,
      isReady: false,
      cdpEndpoint: CDP_ENDPOINT,
    };
  }

  const pages = await getCdpPages();

  const kdpPage = pages.find((p) => p.url.includes("kdp.amazon.com"));
  const kdpTabOpen = !!kdpPage;
  const kdpLoggedIn = kdpPage
    ? !kdpPage.url.includes("signin") &&
      !kdpPage.url.includes("login") &&
      !kdpPage.title.toLowerCase().includes("sign in") &&
      !kdpPage.title.toLowerCase().includes("sign-in")
    : false;
  const studyGuidesTabOpen = pages.some((p) =>
    p.url.includes("scripturemadesimple.replit.app"),
  );

  const isReady =
    chromeCdpAvailable && kdpTabOpen && kdpLoggedIn && studyGuidesTabOpen;

  return {
    localMode: true,
    chromeCdpAvailable,
    kdpTabOpen,
    kdpLoggedIn,
    studyGuidesTabOpen,
    isReady,
    cdpEndpoint: CDP_ENDPOINT,
  };
}

export async function prepareWorkspace(): Promise<SetupResult> {
  const steps: SetupStep[] = [];

  if (CDP_ENDPOINT === null) {
    return {
      steps: [
        {
          name: "Local mode",
          status: "error",
          message:
            "CDP_ENDPOINT is not set. Set it to http://localhost:9222 in your .env file to enable local workspace setup.",
        },
      ],
      isReady: false,
      message: "Local mode is not configured — set CDP_ENDPOINT in .env",
    };
  }

  // ── Step 1: Ensure Chrome is running ───────────────────────────────────────
  const cdpAlreadyUp = await isCdpAvailable();
  if (cdpAlreadyUp) {
    steps.push({
      name: "Chrome (remote debugging)",
      status: "ok",
      message: `Already running on port ${getCdpPort()}`,
    });
  } else {
    await launchChrome();
    const started = await waitForCdp(15_000);
    if (!started) {
      steps.push({
        name: "Chrome (remote debugging)",
        status: "error",
        message:
          `Could not start Chrome on port ${getCdpPort()}. Make sure Google Chrome is installed and nothing else is using that port.`,
      });
      return {
        steps,
        isReady: false,
        message: "Setup stopped: could not launch Chrome",
      };
    }
    steps.push({
      name: "Chrome (remote debugging)",
      status: "ok",
      message: `Chrome launched and connected on port ${getCdpPort()}`,
    });
  }

  // ── Step 2: KDP Bookshelf tab ──────────────────────────────────────────────
  const pages = await getCdpPages();
  const kdpPage = pages.find((p) => p.url.includes("kdp.amazon.com"));
  if (kdpPage) {
    steps.push({
      name: "KDP Bookshelf tab",
      status: "ok",
      message: "Tab is already open",
    });
  } else {
    const opened = await openCdpTab(KDP_URL);
    steps.push({
      name: "KDP Bookshelf tab",
      status: opened ? "ok" : "error",
      message: opened
        ? "Opened KDP Bookshelf in a new tab"
        : "Failed to open KDP tab — check Chrome is responding",
    });
  }

  // ── Step 3: Study Guides tab ───────────────────────────────────────────────
  const studyGuidesOpen = pages.some((p) =>
    p.url.includes("scripturemadesimple.replit.app"),
  );
  if (studyGuidesOpen) {
    steps.push({
      name: "My Study Guides tab",
      status: "ok",
      message: "Tab is already open",
    });
  } else {
    const opened = await openCdpTab(STUDY_GUIDES_URL);
    steps.push({
      name: "My Study Guides tab",
      status: opened ? "ok" : "error",
      message: opened
        ? "Opened My Study Guides in a new tab"
        : "Failed to open Study Guides tab",
    });
  }

  // ── Final status ───────────────────────────────────────────────────────────
  const finalStatus = await getSetupStatus();
  let message: string;
  if (finalStatus.isReady) {
    message = "Workspace is ready — all tabs are open and KDP is logged in.";
  } else if (finalStatus.kdpTabOpen && !finalStatus.kdpLoggedIn) {
    message =
      "Almost ready — please log in to your Amazon KDP account in the browser window that just opened, then click Refresh Status.";
  } else {
    message = "Setup ran — check each step above for any issues.";
  }

  return { steps, isReady: finalStatus.isReady, message };
}
