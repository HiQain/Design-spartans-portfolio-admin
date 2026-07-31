import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

/**
 * Firestore's `imageUrl`/`logoUrl` fields are one of three things:
 * a base64 data: URI (client-side compressed uploads), a plain external URL
 * (pasted in "URL mode"), or empty. Only the first needs converting to a real
 * file - the rest pass through untouched. Idempotent: the filename is a
 * content hash, so re-running the migration never re-writes or duplicates a
 * file that's already there.
 */
export async function migrateImageField(
  rawValue: string | null | undefined,
  uploadsDir: string,
  publicBaseUrl: string,
): Promise<string | null> {
  const value = (rawValue ?? "").trim();
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const dataUriMatch = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!dataUriMatch) {
    // Unrecognized format (e.g. a relative path) - pass through rather than dropping data.
    return value;
  }

  const [, mimeType, base64Payload] = dataUriMatch;
  const extension = MIME_TO_EXT[mimeType!] ?? ".bin";
  const buffer = Buffer.from(base64Payload!, "base64");
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
  const filename = `${hash}${extension}`;
  const filePath = path.join(uploadsDir, filename);

  if (!existsSync(filePath)) {
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(filePath, buffer);
  }

  return `${publicBaseUrl}/uploads/${filename}`;
}
