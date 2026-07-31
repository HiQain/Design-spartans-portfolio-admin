import { Router, type IRouter } from "express";
import { and, asc, eq, isNull, max, or } from "drizzle-orm";
import { db, categoriesTable, generateId } from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  ReorderCategoriesBody,
  ListCategoriesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { notFound } from "../lib/http-error";
import { cascadeCategoryChange } from "../lib/category-cascade";

const router: IRouter = Router();

router.get("/categories", async (_req, res) => {
  const rows = await db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  res.json(ListCategoriesResponse.parse(rows));
});

router.post("/categories", requireAuth, async (req, res) => {
  const body = CreateCategoryBody.parse(req.body);
  const parentId = body.parentId ?? null;

  let parentName: string | null = null;
  if (parentId) {
    const [parent] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, parentId)).limit(1);
    parentName = parent?.name ?? null;
  }

  const siblingFilter = parentId ? eq(categoriesTable.parentId, parentId) : isNull(categoriesTable.parentId);
  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: max(categoriesTable.sortOrder) })
    .from(categoriesTable)
    .where(siblingFilter);

  const now = Date.now();
  const row = {
    id: generateId(),
    name: body.name,
    parentId,
    parentName,
    sortOrder: (maxSortOrder ?? -1) + 1,
    layout: body.layout ?? null,
    createdAt: now,
    updatedAt: null,
  };

  await db.insert(categoriesTable).values(row);
  res.status(201).json(row);
});

router.put("/categories/reorder", requireAuth, async (req, res) => {
  const body = ReorderCategoriesBody.parse(req.body);
  const siblingFilter = body.parentId
    ? and(eq(categoriesTable.parentId, body.parentId))
    : isNull(categoriesTable.parentId);

  await Promise.all(
    body.orderedIds.map((id, index) =>
      db
        .update(categoriesTable)
        .set({ sortOrder: index, updatedAt: Date.now() })
        .where(and(eq(categoriesTable.id, id), siblingFilter)),
    ),
  );

  res.status(204).end();
});

router.put("/categories/:id", requireAuth, async (req, res, next) => {
  const { id } = req.params as { id: string };
  const [before] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id)).limit(1);
  if (!before) {
    next(notFound("Category"));
    return;
  }

  const body = UpdateCategoryBody.parse(req.body);
  const parentId = body.parentId !== undefined ? body.parentId : before.parentId;

  let parentName = before.parentName;
  if (body.parentId !== undefined) {
    if (parentId) {
      const [parent] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, parentId)).limit(1);
      parentName = parent?.name ?? null;
    } else {
      parentName = null;
    }
  }

  const after = {
    ...before,
    name: body.name ?? before.name,
    parentId,
    parentName,
    layout: body.layout !== undefined ? body.layout : before.layout,
    updatedAt: Date.now(),
  };

  await db.update(categoriesTable).set(after).where(eq(categoriesTable.id, id));
  await cascadeCategoryChange(id, before, after);

  res.json(after);
});

router.delete("/categories/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(categoriesTable).where(or(eq(categoriesTable.id, id), eq(categoriesTable.parentId, id)));
  res.status(204).end();
});

export default router;
