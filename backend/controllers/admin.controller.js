import { db } from "../config/db.js";
import { sendSafeError } from "../utils/security.js";

export async function getAdminOverview(_req, res) {
  try {
    const [users, threads, posts] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS count FROM users"),
      db.query("SELECT COUNT(*)::int AS count FROM threads"),
      db.query("SELECT COUNT(*)::int AS count FROM posts"),
    ]);

    return res.json({
      users: users.rows[0].count,
      threads: threads.rows[0].count,
      posts: posts.rows[0].count,
    });
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Admin overview failed", {
      error: String(error?.message || error),
    });
  }
}
