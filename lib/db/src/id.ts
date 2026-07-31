import { nanoid } from "nanoid";

/** Generates a new primary-key id for categories/projects/media rows created after the Firestore migration. */
export function generateId(): string {
  return nanoid();
}
