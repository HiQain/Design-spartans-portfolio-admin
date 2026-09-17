import cron from "node-cron";
import { runScreenshotBackfill } from "./screenshot-backfill";
import { logger } from "./logger";

let isRunning = false;

export function startScreenshotCron(): void {
  // Every 30 minutes - cheap to run since it only ever touches projects still missing
  // a preview (a failed capture retries on the next tick instead of being stuck forever).
  cron.schedule("*/30 * * * *", async () => {
    if (isRunning) {
      logger.warn("Screenshot backfill cron triggered while a previous run is still in progress - skipping");
      return;
    }

    isRunning = true;
    try {
      await runScreenshotBackfill();
    } catch (err) {
      logger.error({ err }, "Screenshot backfill cron failed");
    } finally {
      isRunning = false;
    }
  });
}
