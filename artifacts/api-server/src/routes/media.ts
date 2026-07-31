import { Router, type IRouter } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, mediaTable, generateId } from "@workspace/db";
import { CreateMediaBody, UpdateMediaBody, ListMediaResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { notFound } from "../lib/http-error";

const router: IRouter = Router();

router.get("/media", async (req, res) => {
  const mainCategoryId = typeof req.query.mainCategoryId === "string" ? req.query.mainCategoryId : undefined;
  const cursor = typeof req.query.cursor === "string" ? Number(req.query.cursor) : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;

  const conditions = [
    mainCategoryId ? eq(mediaTable.mainCategoryId, mainCategoryId) : undefined,
    cursor != null && !Number.isNaN(cursor) ? gt(mediaTable.createdAt, cursor) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const rows = await db
    .select()
    .from(mediaTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(mediaTable.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  res.json(
    ListMediaResponse.parse({
      items,
      cursor: items.length ? items[items.length - 1]!.createdAt : null,
      hasMore,
    }),
  );
});

router.post("/media", requireAuth, async (req, res) => {
  const body = CreateMediaBody.parse(req.body);
  const row = {
    id: generateId(),
    ...body,
    description: body.description ?? null,
    link: body.link ?? null,
    imageUrl: body.imageUrl ?? null,
    categoryId: body.categoryId ?? null,
    categoryName: body.categoryName ?? null,
    mainCategoryId: body.mainCategoryId ?? null,
    mainCategoryName: body.mainCategoryName ?? null,
    subCategoryId: body.subCategoryId ?? null,
    subCategoryName: body.subCategoryName ?? null,
    createdAt: Date.now(),
    updatedAt: null,
  };

  await db.insert(mediaTable).values(row);
  res.status(201).json(row);
});

router.put("/media/:id", requireAuth, async (req, res, next) => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1);
  if (!existing) {
    next(notFound("Media"));
    return;
  }

  const body = UpdateMediaBody.parse(req.body);
  const after = { ...existing, ...body, updatedAt: Date.now() };

  await db.update(mediaTable).set(after).where(eq(mediaTable.id, id));
  res.json(after);
});

router.delete("/media/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  res.status(204).end();
});

export default router;
