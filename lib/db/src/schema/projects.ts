import { mysqlTable, varchar, text, boolean, int, bigint } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `isHidden`/`lastCheckedAt` are written by the daily link-check cron
 * (see artifacts/api-server/src/lib/link-check.ts), not by the admin panel.
 */
export const projectsTable = mysqlTable("projects", {
  id: varchar("id", { length: 128 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  link: varchar("link", { length: 1000 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  // Server-captured screenshot of `link`, cached so the public site can show an
  // instant static preview instead of live-embedding the site in an iframe (many
  // sites block that outright via X-Frame-Options/CSP). Null until the capture
  // cron/on-save hook (see lib/screenshot.ts) fills it in.
  previewImageUrl: varchar("preview_image_url", { length: 1000 }),
  // Whether `link`'s own response headers (X-Frame-Options/CSP frame-ancestors) allow
  // it to be embedded live in an iframe - determined alongside the screenshot capture.
  // Null until captured; the public site treats null the same as false (screenshot only).
  isEmbeddable: boolean("is_embeddable"),
  categoryId: varchar("category_id", { length: 128 }),
  categoryName: varchar("category_name", { length: 255 }),
  mainCategoryId: varchar("main_category_id", { length: 128 }),
  mainCategoryName: varchar("main_category_name", { length: 255 }),
  subCategoryId: varchar("sub_category_id", { length: 128 }),
  subCategoryName: varchar("sub_category_name", { length: 255 }),
  // Lower sorts first within a (mainCategoryId, subCategoryId) group; ties (the
  // common case - nothing manually reordered yet) break by createdAt DESC, so
  // newly-created items naturally show up first without any special-casing.
  sortOrder: int("sort_order").notNull().default(0),
  isHidden: boolean("is_hidden").notNull().default(false),
  lastCheckedAt: bigint("last_checked_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  previewImageUrl: true,
  isEmbeddable: true,
  isHidden: true,
  lastCheckedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
