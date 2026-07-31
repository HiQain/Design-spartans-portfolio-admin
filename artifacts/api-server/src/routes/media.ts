import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db, mediaTable, generateId } from "@workspace/db";
import { CreateMediaBody, UpdateMediaBody, ReorderMediaBody, ListMediaResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { notFound } from "../lib/http-error";

const router: IRouter = Router();

// Opaque "sortOrder.createdAt.id" keyset cursor - matches the query's ORDER BY
// exactly, so pagination stays correct once sortOrder stops being tied at 0 for
// every row (i.e. as soon as an admin reorders that category/subcategory group).
// A cursor built from createdAt alone (the old approach) would silently skip or
// strand rows whenever a later page's sortOrder didn't line up with createdAt order.
function parseMediaCursor(raw: unknown): { sortOrder: number; createdAt: number; id: string } | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const [sortOrderPart, createdAtPart, ...idParts] = raw.split(".");
  const sortOrder = Number(sortOrderPart);
  const createdAt = Number(createdAtPart);
  const id = idParts.join(".");
  if (!Number.isFinite(sortOrder) || !Number.isFinite(createdAt) || !id) return undefined;
  return { sortOrder, createdAt, id };
}

function encodeMediaCursor(row: { sortOrder: number; createdAt: number; id: string }): string {
  return `${row.sortOrder}.${row.createdAt}.${row.id}`;
}

router.get("/media", async (req, res) => {
  const mainCategoryId = typeof req.query.mainCategoryId === "string" ? req.query.mainCategoryId : undefined;
  const subCategoryId = typeof req.query.subCategoryId === "string" ? req.query.subCategoryId : undefined;
  const cursor = parseMediaCursor(req.query.cursor);
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;

  const conditions = [
    mainCategoryId ? eq(mediaTable.mainCategoryId, mainCategoryId) : undefined,
    subCategoryId ? eq(mediaTable.subCategoryId, subCategoryId) : undefined,
    cursor
      ? or(
          gt(mediaTable.sortOrder, cursor.sortOrder),
          and(
            eq(mediaTable.sortOrder, cursor.sortOrder),
            or(
              lt(mediaTable.createdAt, cursor.createdAt),
              and(eq(mediaTable.createdAt, cursor.createdAt), gt(mediaTable.id, cursor.id)),
            ),
          ),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const rows = await db
    .select()
    .from(mediaTable)
    .where(conditions.length ? and(...conditions) : undefined)
    // sortOrder defaults to 0 for every item until an admin manually drags it
    // within its category group, so createdAt DESC naturally puts new uploads
    // first; id is a final tiebreaker so the keyset cursor above is well-defined
    // even if two rows share both sortOrder and createdAt.
    .orderBy(asc(mediaTable.sortOrder), desc(mediaTable.createdAt), asc(mediaTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];

  res.json(
    ListMediaResponse.parse({
      items,
      cursor: lastItem ? encodeMediaCursor(lastItem) : null,
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
    secondaryImageUrl: body.secondaryImageUrl ?? null,
    categoryId: body.categoryId ?? null,
    categoryName: body.categoryName ?? null,
    mainCategoryId: body.mainCategoryId ?? null,
    mainCategoryName: body.mainCategoryName ?? null,
    subCategoryId: body.subCategoryId ?? null,
    subCategoryName: body.subCategoryName ?? null,
    playStoreLink: body.playStoreLink ?? null,
    appStoreLink: body.appStoreLink ?? null,
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: null,
  };

  await db.insert(mediaTable).values(row);
  res.status(201).json(row);
});

router.put("/media/reorder", requireAuth, async (req, res) => {
  const body = ReorderMediaBody.parse(req.body);
  const siblingFilter = and(
    body.mainCategoryId ? eq(mediaTable.mainCategoryId, body.mainCategoryId) : isNull(mediaTable.mainCategoryId),
    body.subCategoryId ? eq(mediaTable.subCategoryId, body.subCategoryId) : isNull(mediaTable.subCategoryId),
  );

  await Promise.all(
    body.orderedIds.map((id, index) =>
      db
        .update(mediaTable)
        .set({ sortOrder: index, updatedAt: Date.now() })
        .where(and(eq(mediaTable.id, id), siblingFilter)),
    ),
  );

  res.status(204).end();
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
