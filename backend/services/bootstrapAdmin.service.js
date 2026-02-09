import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { hashPassword } from "../utils/hash.js";
import { logSecurityEvent } from "../utils/security.js";

async function ensureUserRoleColumn() {
  await db.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user'"
  );
  await db.query("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''");
}

export async function bootstrapAdminUser() {
  await ensureUserRoleColumn();
  const username = env.SUPER_ADMIN_USERNAME;

  // Enforce a single super user identity.
  await db.query("UPDATE users SET role = 'user' WHERE role = 'admin' AND username <> $1", [username]);
  await db.query("UPDATE users SET role = 'admin' WHERE username = $1", [username]);

  if (!env.ADMIN_PASSWORD) {
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  const result = await db.query("SELECT id FROM users WHERE username = $1", [username]);
  if (!result.rows.length) {
    await db.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
      [username, passwordHash]
    );
    return;
  }

  await db.query("UPDATE users SET password_hash = $2, role = 'admin' WHERE username = $1", [
    username,
    passwordHash,
  ]);
}

export async function bootstrapSecurityState() {
  try {
    await bootstrapAdminUser();
  } catch (error) {
    logSecurityEvent("Security bootstrap failed", {
      error: String(error?.message || error),
    });
    throw error;
  }
}
