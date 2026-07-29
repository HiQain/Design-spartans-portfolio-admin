import { Router, type IRouter } from "express";
import { count } from "drizzle-orm";
import { db, categoriesTable, projectsTable, mediaTable } from "@workspace/db";
import { GetStatsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/stats", requireAuth, async (_req, res) => {
  const [[{ categoriesCount }], [{ projectsCount }], [{ mediaCount }]] = await Promise.all([
    db.select({ categoriesCount: count() }).from(categoriesTable),
    db.select({ projectsCount: count() }).from(projectsTable),
    db.select({ mediaCount: count() }).from(mediaTable),
  ]);

  res.json(GetStatsResponse.parse({ categoriesCount, projectsCount, mediaCount }));
});

export default router;
