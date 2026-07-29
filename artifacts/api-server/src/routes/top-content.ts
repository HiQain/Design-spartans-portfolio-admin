import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, topContentTable } from "@workspace/db";
import { UpdateTopContentBody, GetTopContentResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const PRIMARY_ID = "primary";
const router: IRouter = Router();

router.get("/top-content", async (_req, res) => {
  const [row] = await db.select().from(topContentTable).where(eq(topContentTable.id, PRIMARY_ID)).limit(1);
  res.json(GetTopContentResponse.parse({ content: row?.content ?? null, logoUrl: row?.logoUrl ?? null, updatedAt: row?.updatedAt ?? null }));
});

router.put("/top-content", requireAuth, async (req, res) => {
  const body = UpdateTopContentBody.parse(req.body);
  const row = {
    id: PRIMARY_ID,
    content: body.content ?? null,
    logoUrl: body.logoUrl ?? null,
    updatedAt: Date.now(),
  };

  await db
    .insert(topContentTable)
    .values(row)
    .onDuplicateKeyUpdate({ set: { content: row.content, logoUrl: row.logoUrl, updatedAt: row.updatedAt } });

  res.json({ content: row.content, logoUrl: row.logoUrl, updatedAt: row.updatedAt });
});

export default router;
