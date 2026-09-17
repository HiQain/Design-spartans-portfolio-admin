import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer";
import { generateId } from "@workspace/db";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Server-side screenshots of project links, cached to disk - see the `previewImageUrl`
 * column comment in lib/db/src/schema/projects.ts for why: many sites refuse to be
 * embedded live in an iframe (X-Frame-Options/CSP frame-ancestors), which a screenshot
 * sidesteps entirely since it's a normal top-level navigation, not a frame.
 */
// Matches the frontend's DESKTOP_WIDTH/HEIGHT (see ProjectModal.tsx) - a tall capture
// (not just the first screenful) so the public site can keep its slow auto-pan effect
// over the same static image instead of a live iframe.
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 2000;
const NAV_TIMEOUT_MS = 20000;
// Extra settle time after DOMContentLoaded - some sites are visually incomplete at that
// point (hero images, webfonts, animations) even though the event fired. networkidle*
// isn't used here because several sites we embed keep long-lived connections open
// (analytics, live chat) that never let the network go idle within a sane timeout.
const SETTLE_MS = 2500;

const screenshotsDir = path.join(env.uploadsDir, "screenshots");

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function normalizeUrl(rawUrl: string): string {
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

/**
 * Captures a screenshot of `link` and returns its public URL, or null if the capture
 * failed (site unreachable, timed out, etc.) - best-effort, never throws, since this
 * always runs in the background rather than blocking a request or the cron loop.
 */
export async function captureScreenshot(link: string): Promise<string | null> {
  let page;
  try {
    mkdirSync(screenshotsDir, { recursive: true });
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    await page.goto(normalizeUrl(link), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const filename = `${generateId()}.jpg`;
    await page.screenshot({ path: path.join(screenshotsDir, filename), type: "jpeg", quality: 80 });

    return `${env.apiPublicBaseUrl}/uploads/screenshots/${filename}`;
  } catch (err) {
    logger.warn({ err, link }, "Screenshot capture failed");
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}
