import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { captureScreenshot } from "./screenshot";
import { logger } from "./logger";

// Screenshots are slow (a few seconds each, one Chromium tab per capture) - keep this
// low so a big backfill doesn't starve the server of memory/CPU during normal traffic.
const CAPTURE_CONCURRENCY = 2;

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

/**
 * Captures screenshots for every project that has a link but no cached preview yet -
 * new projects/link changes are handled instantly by the create/update routes (see
 * routes/projects.ts), so this only ever needs to catch up on items that predate that
 * hook, or a capture that failed the first time around.
 */
export async function runScreenshotBackfill(): Promise<{ attempted: number; captured: number }> {
  const candidates = await db
    .select()
    .from(projectsTable)
    .where(and(isNotNull(projectsTable.link), ne(projectsTable.link, ""), isNull(projectsTable.previewImageUrl)));

  let captured = 0;

  await runWithConcurrency(candidates, CAPTURE_CONCURRENCY, async (project) => {
    const result = await captureScreenshot(project.link!);
    if (!result) return;

    captured++;
    await db
      .update(projectsTable)
      .set({ previewImageUrl: result.previewImageUrl, isEmbeddable: result.isEmbeddable })
      .where(eq(projectsTable.id, project.id));
  });

  logger.info({ attempted: candidates.length, captured }, "Screenshot backfill finished");
  return { attempted: candidates.length, captured };
}
