import { mysqlTable, varchar, int, bigint } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `parentId` is an unenforced soft reference (no FK constraint): categories are
 * only ever one level deep, and deleting a category is allowed to leave
 * projects/media with a dangling categoryId (matches existing admin-panel
 * behavior) rather than cascading - enforcing an FK here would fight that.
 */
export const categoriesTable = mysqlTable("categories", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: varchar("parent_id", { length: 128 }),
  parentName: varchar("parent_name", { length: 255 }),
  sortOrder: int("sort_order").notNull().default(0),
  layout: varchar("layout", { length: 32 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
