import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, projectsTable, generateId } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody, ReorderProjectsBody, ListProjectsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { optionalAuth } from "../middlewares/optional-auth";
import { notFound } from "../lib/http-error";

const router: IRouter = Router();

router.get("/projects", optionalAuth, async (req, res) => {
  const mainCategoryId = typeof req.query.mainCategoryId === "string" ? req.query.mainCategoryId : undefined;
  const includeHidden = req.user != null && req.query.includeHidden === "true";

  const conditions = [
    mainCategoryId ? eq(projectsTable.mainCategoryId, mainCategoryId) : undefined,
    includeHidden ? undefined : eq(projectsTable.isHidden, false),
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const rows = await db
    .select()
    .from(projectsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    // sortOrder defaults to 0 for every project until an admin manually drags it
    // within its category group, so createdAt DESC naturally puts new uploads first.
    .orderBy(asc(projectsTable.sortOrder), desc(projectsTable.createdAt));

  res.json(ListProjectsResponse.parse(rows));
});

router.post("/projects", requireAuth, async (req, res) => {
  const body = CreateProjectBody.parse(req.body);
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
    sortOrder: 0,
    isHidden: false,
    lastCheckedAt: null,
    createdAt: Date.now(),
    updatedAt: null,
  };

  await db.insert(projectsTable).values(row);
  res.status(201).json(row);
});

router.put("/projects/reorder", requireAuth, async (req, res) => {
  const body = ReorderProjectsBody.parse(req.body);
  const siblingFilter = and(
    body.mainCategoryId ? eq(projectsTable.mainCategoryId, body.mainCategoryId) : isNull(projectsTable.mainCategoryId),
    body.subCategoryId ? eq(projectsTable.subCategoryId, body.subCategoryId) : isNull(projectsTable.subCategoryId),
  );

  await Promise.all(
    body.orderedIds.map((id, index) =>
      db
        .update(projectsTable)
        .set({ sortOrder: index, updatedAt: Date.now() })
        .where(and(eq(projectsTable.id, id), siblingFilter)),
    ),
  );

  res.status(204).end();
});

router.put("/projects/:id", requireAuth, async (req, res, next) => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
  if (!existing) {
    next(notFound("Project"));
    return;
  }

  const body = UpdateProjectBody.parse(req.body);
  const after = { ...existing, ...body, updatedAt: Date.now() };

  await db.update(projectsTable).set(after).where(eq(projectsTable.id, id));
  res.json(after);
});

router.delete("/projects/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.status(204).end();
});

export default router;
