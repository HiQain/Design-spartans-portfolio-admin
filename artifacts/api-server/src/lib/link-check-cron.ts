import cron from "node-cron";
import { runLinkCheck } from "./link-check";
import { logger } from "./logger";

let isRunning = false;

export function startLinkCheckCron(): void {
  // Once daily at 03:00 server time - low-traffic window, and this check
  // hits every project's external URL so it shouldn't overlap page traffic.
  cron.schedule("0 3 * * *", async () => {
    if (isRunning) {
      logger.warn("Link check cron triggered while a previous run is still in progress - skipping");
      return;
    }

    isRunning = true;
    try {
      await runLinkCheck();
    } catch (err) {
      logger.error({ err }, "Link check cron failed");
    } finally {
      isRunning = false;
    }
  });
}
