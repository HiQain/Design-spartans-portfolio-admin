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
 * Best-effort read of whether a site's own response headers allow it to be embedded by
 * a third-party origin (ours) at all - X-Frame-Options DENY/SAMEORIGIN or a CSP
 * `frame-ancestors` list that doesn't include `*` both mean the browser will refuse to
 * render it in our iframe no matter what we do client-side, so we fall back to the
 * screenshot for those. Defaults to embeddable when neither header is present, since
 * that's the common case and the safest default given no restriction was declared.
 */
export function isEmbeddableFromHeaders(headers: Record<string, string>): boolean {
  const xfo = (headers["x-frame-options"] || "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;

  const csp = headers["content-security-policy"] || "";
  const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
  if (frameAncestors && !frameAncestors.includes("*")) return false;

  return true;
}

export interface ScreenshotResult {
  previewImageUrl: string;
  isEmbeddable: boolean;
}

/**
 * Captures a screenshot of `link` and checks whether it can also be live-embedded, or
 * returns null if the capture failed (site unreachable, timed out, etc.) - best-effort,
 * never throws, since this always runs in the background rather than blocking a request
 * or the cron loop.
 */
export async function captureScreenshot(link: string): Promise<ScreenshotResult | null> {
  let page;
  try {
    mkdirSync(screenshotsDir, { recursive: true });
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    const response = await page.goto(normalizeUrl(link), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const filename = `${generateId()}.jpg`;
    await page.screenshot({ path: path.join(screenshotsDir, filename), type: "jpeg", quality: 80 });

    return {
      previewImageUrl: `${env.apiPublicBaseUrl}/uploads/screenshots/${filename}`,
      isEmbeddable: response ? isEmbeddableFromHeaders(response.headers()) : true,
    };
  } catch (err) {
    logger.warn({ err, link }, "Screenshot capture failed");
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}
