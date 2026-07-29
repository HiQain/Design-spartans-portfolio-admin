import "dotenv/config";
import path from "node:path";
import { count } from "drizzle-orm";
import { db, pool, categoriesTable, projectsTable, mediaTable, topContentTable } from "@workspace/db";
import { fetchCollection, fetchDocument } from "./lib/firestore-source";
import { migrateImageField } from "./lib/migrate-image";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "..", "..", "artifacts", "api-server", "uploads");

const PUBLIC_BASE_URL = process.env.API_PUBLIC_BASE_URL;
if (!PUBLIC_BASE_URL) {
  throw new Error(
    "API_PUBLIC_BASE_URL must be set (e.g. https://api.designspartans.com) - it's baked into every migrated image URL.",
  );
}

interface RawCategory {
  id: string;
  name?: string;
  parentId?: string;
  sortOrder?: number;
  layout?: string;
  layoutType?: string;
  displayType?: string;
  cardType?: string;
  variant?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface RawItem {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  content?: string;
  summary?: string;
  details?: string;
  shortDescription?: string;
  link?: string;
  imageUrl?: string;
  categoryId?: string;
  categoryName?: string;
  mainCategoryId?: string;
  mainCategoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface RawTopContent {
  content?: string;
  logoUrl?: string;
  updatedAt?: number;
}

const CHUNK_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function pickDescription(item: RawItem): string | null {
  const candidates = [item.description, item.content, item.summary, item.details, item.shortDescription];
  const value = candidates.find((c) => String(c || "").trim());
  return value ? value.trim() : null;
}

function pickLayout(category: RawCategory): string | null {
  const raw = category.layout || category.layoutType || category.displayType || category.cardType || category.variant;
  return raw ? String(raw).trim().toLowerCase() : null;
}

/** Validates the "only one level of category nesting" assumption the two-pass insert below relies on. */
function assertSingleLevelNesting(categories: RawCategory[]): void {
  const byId = new Map(categories.map((c) => [c.id, c]));

  for (const category of categories) {
    if (!category.parentId) continue;
    const parent = byId.get(category.parentId);
    if (parent?.parentId) {
      throw new Error(
        `Category nesting is deeper than one level: "${category.id}" -> "${parent.id}" -> "${parent.parentId}". ` +
          "Migration assumes main/sub only - aborting rather than risk a silently broken hierarchy.",
      );
    }
  }
}

async function migrateCategories(): Promise<number> {
  const raw = await fetchCollection<RawCategory>("categories");
  assertSingleLevelNesting(raw);

  const mains = raw.filter((c) => !c.parentId);
  const subs = raw.filter((c) => c.parentId);
  const mainNameById = new Map(mains.map((m) => [m.id, m.name ?? ""]));

  for (const batch of [mains, subs]) {
    for (const group of chunk(batch, CHUNK_SIZE)) {
      const rows = group.map((c) => ({
        id: c.id,
        name: c.name ?? "",
        parentId: c.parentId ?? null,
        parentName: c.parentId ? (mainNameById.get(c.parentId) ?? null) : null,
        sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : 0,
        layout: pickLayout(c),
        createdAt: c.createdAt ?? Date.now(),
        updatedAt: c.updatedAt ?? null,
      }));

      for (const row of rows) {
        await db
          .insert(categoriesTable)
          .values(row)
          .onDuplicateKeyUpdate({
            set: {
              name: row.name,
              parentId: row.parentId,
              parentName: row.parentName,
              sortOrder: row.sortOrder,
              layout: row.layout,
              updatedAt: row.updatedAt,
            },
          });
      }
    }
  }

  return raw.length;
}

async function migrateProjects(): Promise<number> {
  const raw = await fetchCollection<RawItem>("projects");

  for (const group of chunk(raw, CHUNK_SIZE)) {
    for (const item of group) {
      const row = {
        id: item.id,
        title: item.title || item.name || "Untitled",
        description: pickDescription(item),
        link: item.link || null,
        imageUrl: await migrateImageField(item.imageUrl, UPLOADS_DIR, PUBLIC_BASE_URL!),
        categoryId: item.categoryId || null,
        categoryName: item.categoryName || null,
        mainCategoryId: item.mainCategoryId || null,
        mainCategoryName: item.mainCategoryName || null,
        subCategoryId: item.subCategoryId || null,
        subCategoryName: item.subCategoryName || null,
        isHidden: false,
        lastCheckedAt: null,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: item.updatedAt ?? null,
      };

      await db
        .insert(projectsTable)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            title: row.title,
            description: row.description,
            link: row.link,
            imageUrl: row.imageUrl,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            mainCategoryId: row.mainCategoryId,
            mainCategoryName: row.mainCategoryName,
            subCategoryId: row.subCategoryId,
            subCategoryName: row.subCategoryName,
            updatedAt: row.updatedAt,
          },
        });
    }
  }

  return raw.length;
}

async function migrateMedia(): Promise<number> {
  const raw = await fetchCollection<RawItem>("media");

  for (const group of chunk(raw, CHUNK_SIZE)) {
    for (const item of group) {
      const row = {
        id: item.id,
        title: item.title || item.name || "Untitled",
        description: pickDescription(item),
        link: item.link || null,
        imageUrl: await migrateImageField(item.imageUrl, UPLOADS_DIR, PUBLIC_BASE_URL!),
        categoryId: item.categoryId || null,
        categoryName: item.categoryName || null,
        mainCategoryId: item.mainCategoryId || null,
        mainCategoryName: item.mainCategoryName || null,
        subCategoryId: item.subCategoryId || null,
        subCategoryName: item.subCategoryName || null,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: item.updatedAt ?? null,
      };

      await db
        .insert(mediaTable)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            title: row.title,
            description: row.description,
            link: row.link,
            imageUrl: row.imageUrl,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            mainCategoryId: row.mainCategoryId,
            mainCategoryName: row.mainCategoryName,
            subCategoryId: row.subCategoryId,
            subCategoryName: row.subCategoryName,
            updatedAt: row.updatedAt,
          },
        });
    }
  }

  return raw.length;
}

async function migrateTopContent(): Promise<void> {
  const raw = await fetchDocument<RawTopContent>("topContent", "primary");
  if (!raw) return;

  const row = {
    id: "primary",
    content: raw.content ?? null,
    logoUrl: await migrateImageField(raw.logoUrl, UPLOADS_DIR, PUBLIC_BASE_URL!),
    updatedAt: raw.updatedAt ?? Date.now(),
  };

  await db
    .insert(topContentTable)
    .values(row)
    .onDuplicateKeyUpdate({ set: { content: row.content, logoUrl: row.logoUrl, updatedAt: row.updatedAt } });
}

async function verify(sourceCounts: { categories: number; projects: number; media: number }) {
  const [[{ categoriesCount }], [{ projectsCount }], [{ mediaCount }]] = await Promise.all([
    db.select({ categoriesCount: count() }).from(categoriesTable),
    db.select({ projectsCount: count() }).from(projectsTable),
    db.select({ mediaCount: count() }).from(mediaTable),
  ]);

  console.log("\n--- Migration verification ---");
  console.log(`categories: firestore=${sourceCounts.categories} mysql=${categoriesCount}`);
  console.log(`projects:   firestore=${sourceCounts.projects} mysql=${projectsCount}`);
  console.log(`media:      firestore=${sourceCounts.media} mysql=${mediaCount}`);

  if (
    categoriesCount !== sourceCounts.categories ||
    projectsCount !== sourceCounts.projects ||
    mediaCount !== sourceCounts.media
  ) {
    console.warn(
      "\nRow counts don't match source collection sizes exactly - if this is a re-run over already-migrated " +
        "data that's expected (existing ids are updated in place, not duplicated); otherwise inspect before trusting this migration.",
    );
  }
}

async function main() {
  console.log(`Uploads dir: ${UPLOADS_DIR}`);
  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);

  const categoriesCount = await migrateCategories();
  console.log(`Categories migrated: ${categoriesCount}`);

  const projectsCount = await migrateProjects();
  console.log(`Projects migrated: ${projectsCount}`);

  const mediaCount = await migrateMedia();
  console.log(`Media migrated: ${mediaCount}`);

  await migrateTopContent();
  console.log("Top content migrated");

  await verify({ categories: categoriesCount, projects: projectsCount, media: mediaCount });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
