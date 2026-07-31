import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Ported from the dead-link-detection algorithm originally drafted (but never
 * shipped - it was too slow to run on every page request) in
 * designspartans-porfolio/lib/portfolio.ts. Philosophy unchanged: never wrongly
 * hide a real client site, so only a *definitive* dead signal counts - DNS not
 * resolving or a refused connection, reproduced across 3 attempts, or an
 * unambiguous 404/410. Timeouts, 403s, 500s, TLS hiccups etc. all count as
 * "keep it visible". Now runs once daily in a batch instead of per-request, so
 * the old per-request in-memory TTL cache is gone - persistence lives in the
 * projects table's `isHidden`/`lastCheckedAt` columns instead.
 */
const CHECK_TIMEOUT_MS = 8000;
const CHECK_CONCURRENCY = 8;

/** Admin-entered links aren't guaranteed to include a scheme (e.g. "test.com") - fetch() throws a plain TypeError for those, not a network error, so without this every schemeless link would silently read as "uncertain" and never get flagged dead. */
function normalizeUrl(rawUrl: string): string {
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

async function checkOnce(url: string): Promise<"alive" | "dead" | "uncertain"> {
  try {
    const response = await fetch(normalizeUrl(url), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });

    if (response.status === 404 || response.status === 410) return "dead";
    return "alive";
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    return code === "ENOTFOUND" || code === "ECONNREFUSED" ? "dead" : "uncertain";
  }
}

async function isDefinitelyDead(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));

    const result = await checkOnce(url);
    if (result !== "dead") return false;
  }

  return true;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const item = items[nextIndex++]!;
      await worker(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

export async function runLinkCheck(): Promise<{ checked: number; hidden: number; unhidden: number }> {
  const candidates = await db
    .select()
    .from(projectsTable)
    .where(and(isNotNull(projectsTable.link), ne(projectsTable.link, "")));

  let hidden = 0;
  let unhidden = 0;

  await runWithConcurrency(candidates, CHECK_CONCURRENCY, async (project) => {
    const dead = await isDefinitelyDead(project.link!);
    if (dead && !project.isHidden) hidden++;
    if (!dead && project.isHidden) unhidden++;

    await db
      .update(projectsTable)
      .set({ isHidden: dead, lastCheckedAt: Date.now() })
      .where(eq(projectsTable.id, project.id));
  });

  logger.info({ checked: candidates.length, hidden, unhidden }, "Link check cron finished");
  return { checked: candidates.length, hidden, unhidden };
}
