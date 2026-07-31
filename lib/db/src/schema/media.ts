import { mysqlTable, varchar, text, int, bigint } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Mirrors `projects` minus the link-check fields - the daily dead-link cron
 * only covers `projects`. `description`/`link` are kept nullable even though
 * the admin panel never writes them, since legacy Firestore `media` docs may
 * carry them (MediaItem was typed as an alias of Project).
 */
export const mediaTable = mysqlTable("media", {
  id: varchar("id", { length: 128 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  link: varchar("link", { length: 1000 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  // Second image (eg. the back of a t-shirt/business card) for the Merchandise &
  // Apparel / Branding Materials categories - when both are set, the public site
  // shows a rotating 3D flip card instead of a single static image.
  secondaryImageUrl: varchar("secondary_image_url", { length: 1000 }),
  categoryId: varchar("category_id", { length: 128 }),
  categoryName: varchar("category_name", { length: 255 }),
  mainCategoryId: varchar("main_category_id", { length: 128 }),
  mainCategoryName: varchar("main_category_name", { length: 255 }),
  subCategoryId: varchar("sub_category_id", { length: 128 }),
  subCategoryName: varchar("sub_category_name", { length: 255 }),
  playStoreLink: varchar("play_store_link", { length: 1000 }),
  appStoreLink: varchar("app_store_link", { length: 1000 }),
  // Lower sorts first within a (mainCategoryId, subCategoryId) group; ties (the
  // common case - nothing manually reordered yet) break by createdAt DESC, so
  // newly-created items naturally show up first without any special-casing.
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
