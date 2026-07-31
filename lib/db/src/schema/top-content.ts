import { mysqlTable, varchar, text, bigint } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Single-row table - always keyed by the fixed id "primary", matching the old topContent/primary Firestore doc. */
export const topContentTable = mysqlTable("top_content", {
  id: varchar("id", { length: 16 }).primaryKey(),
  content: text("content"),
  logoUrl: varchar("logo_url", { length: 1000 }),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const upsertTopContentSchema = createInsertSchema(topContentTable).omit({ id: true, updatedAt: true });
export type UpsertTopContent = z.infer<typeof upsertTopContentSchema>;
export type TopContent = typeof topContentTable.$inferSelect;
