import { and, eq, isNull, or } from "drizzle-orm";
import { db, categoriesTable, projectsTable, mediaTable, type Category } from "@workspace/db";

/**
 * Firestore's admin panel kept denormalized category name/id fields on every
 * project/media row (mainCategoryId/mainCategoryName, subCategoryId/subCategoryName,
 * categoryId/categoryName = the "effective leaf" - the subcategory if one is chosen,
 * else the main category). Renaming or reparenting a category has to propagate to
 * every row referencing it, or the portfolio site shows stale names.
 *
 * (The original admin panel's cascade targeted a Firestore collection literally
 * named "content", which doesn't exist - the real collection is "media" - so this
 * propagation silently never reached media documents. Fixed here to target `media`.)
 */
export async function cascadeCategoryChange(
  categoryId: string,
  before: Category,
  after: Category,
): Promise<void> {
  const nameChanged = before.name !== after.name;
  const reparented = before.parentId !== after.parentId;
  const wasMain = !before.parentId;

  if (!nameChanged && !reparented) return;

  if (wasMain) {
    if (nameChanged) {
      await db.update(categoriesTable).set({ parentName: after.name }).where(eq(categoriesTable.parentId, categoryId));

      for (const table of [projectsTable, mediaTable]) {
        await db.update(table).set({ mainCategoryName: after.name }).where(eq(table.mainCategoryId, categoryId));
        await db
          .update(table)
          .set({ categoryName: after.name })
          .where(
            and(
              eq(table.mainCategoryId, categoryId),
              or(isNull(table.subCategoryId), eq(table.subCategoryId, "")),
            ),
          );
      }
    }
    return;
  }

  // Sub category.
  if (nameChanged) {
    for (const table of [projectsTable, mediaTable]) {
      await db
        .update(table)
        .set({ subCategoryName: after.name, categoryName: after.name })
        .where(eq(table.subCategoryId, categoryId));
    }
  }

  if (reparented && after.parentId) {
    const [newParent] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, after.parentId)).limit(1);
    if (newParent) {
      for (const table of [projectsTable, mediaTable]) {
        await db
          .update(table)
          .set({ mainCategoryId: newParent.id, mainCategoryName: newParent.name })
          .where(eq(table.subCategoryId, categoryId));
      }
    }
  }
}
