import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

/**
 * One-off script to seed/reset an admin login. There's no registration UI
 * (intentionally - only a handful of pre-provisioned admin accounts exist),
 * so this is the only way to create or reset one.
 *
 * Usage: pnpm --filter @workspace/scripts create-admin <email> <password>
 */
async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: pnpm --filter @workspace/scripts create-admin <email> <password>");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (existing) {
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, existing.id));
    console.log(`Updated password for existing admin: ${email}`);
  } else {
    await db.insert(usersTable).values({ email, passwordHash, createdAt: Date.now() });
    console.log(`Created admin: ${email}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
