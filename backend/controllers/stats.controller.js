import { db } from "../config/db.js";
import { sendSafeError } from "../utils/security.js";

export async function getPublicStats(_req, res) {
  try {
    const { rows } = await db.query(
      `
      WITH activity AS (
        SELECT
          t.id,
          GREATEST(t.created_at, COALESCE(MAX(p.created_at), t.created_at)) AS last_activity_at
        FROM threads t
        LEFT JOIN posts p ON p.thread_id = t.id
        GROUP BY t.id
      )
      SELECT
        (SELECT COUNT(*)::int FROM activity WHERE last_activity_at >= NOW() - INTERVAL '24 hours') AS active_threads,
        (SELECT COUNT(DISTINCT author_ref)::int
           FROM posts
          WHERE author_type = 'anon'
            AND created_at >= NOW() - INTERVAL '24 hours') AS anonymous_users,
        (SELECT COUNT(*)::int FROM posts) AS total_posts
      `
    );

    const stats = rows[0] || { active_threads: 0, anonymous_users: 0, total_posts: 0 };
    return res.json({
      activeThreads: stats.active_threads,
      anonymousUsers: stats.anonymous_users,
      totalPosts: stats.total_posts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Failed to fetch public stats", {
      error: String(error?.message || error),
    });
  }
}

