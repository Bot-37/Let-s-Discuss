import { db } from "../config/db.js";
import { sendSafeError } from "../utils/security.js";

function resolveIdentity(req) {
  if (req.user?.id) {
    return {
      type: "user",
      authorType: "user",
      authorRef: String(req.user.id),
    };
  }
  return {
    type: "anon",
    authorType: "anon",
    authorRef: String(req.anonId || ""),
  };
}

const RANKED_POSTS_CTE = `
  WITH ranked AS (
    SELECT
      p.id,
      p.thread_id,
      p.content,
      p.created_at,
      p.author_type,
      p.author_ref,
      ROW_NUMBER() OVER (PARTITION BY p.thread_id ORDER BY p.created_at, p.id) AS rn
    FROM posts p
  )
`;

export async function getDashboardSummary(req, res) {
  try {
    const identity = resolveIdentity(req);
    if (!identity.authorRef) {
      return res.status(400).json({ message: "Unable to resolve dashboard identity" });
    }

    const params = [identity.authorType, identity.authorRef];

    const summaryQuery = db.query(
      `
      ${RANKED_POSTS_CTE}
      SELECT
        COUNT(*) FILTER (WHERE r.rn = 1)::int AS threads_started,
        COUNT(*) FILTER (WHERE r.rn > 1)::int AS replies_posted,
        COUNT(*)::int AS total_posts
      FROM ranked r
      WHERE r.author_type = $1
        AND r.author_ref = $2
      `,
      params
    );

    const startedThreadsQuery = db.query(
      `
      ${RANKED_POSTS_CTE},
      thread_metrics AS (
        SELECT
          t.id,
          t.title,
          t.created_at,
          COUNT(p.id)::int AS post_count,
          GREATEST(t.created_at, COALESCE(MAX(p.created_at), t.created_at)) AS last_activity_at
        FROM threads t
        LEFT JOIN posts p ON p.thread_id = t.id
        GROUP BY t.id
      )
      SELECT
        tm.id,
        tm.title,
        tm.created_at,
        tm.post_count,
        tm.last_activity_at,
        r.id AS first_post_id,
        r.content AS first_post_content,
        r.created_at AS first_post_created_at
      FROM ranked r
      JOIN thread_metrics tm ON tm.id = r.thread_id
      WHERE r.rn = 1
        AND r.author_type = $1
        AND r.author_ref = $2
      ORDER BY tm.last_activity_at DESC
      LIMIT 50
      `,
      params
    );

    const repliesQuery = db.query(
      `
      ${RANKED_POSTS_CTE}
      SELECT
        r.id,
        r.thread_id,
        r.content,
        r.created_at,
        t.title AS thread_title,
        t.created_at AS thread_created_at
      FROM ranked r
      JOIN threads t ON t.id = r.thread_id
      WHERE r.rn > 1
        AND r.author_type = $1
        AND r.author_ref = $2
      ORDER BY r.created_at DESC
      LIMIT 120
      `,
      params
    );

    const activityQuery = db.query(
      `
      ${RANKED_POSTS_CTE}
      SELECT *
      FROM (
        SELECT
          'thread_start'::text AS kind,
          r.id AS post_id,
          r.thread_id,
          t.title AS thread_title,
          r.content,
          r.created_at
        FROM ranked r
        JOIN threads t ON t.id = r.thread_id
        WHERE r.rn = 1
          AND r.author_type = $1
          AND r.author_ref = $2

        UNION ALL

        SELECT
          'reply'::text AS kind,
          r.id AS post_id,
          r.thread_id,
          t.title AS thread_title,
          r.content,
          r.created_at
        FROM ranked r
        JOIN threads t ON t.id = r.thread_id
        WHERE r.rn > 1
          AND r.author_type = $1
          AND r.author_ref = $2
      ) activity
      ORDER BY created_at DESC
      LIMIT 40
      `,
      params
    );

    const [summaryResult, startedThreadsResult, repliesResult, activityResult] = await Promise.all([
      summaryQuery,
      startedThreadsQuery,
      repliesQuery,
      activityQuery,
    ]);

    const summary = summaryResult.rows[0] || {
      threads_started: 0,
      replies_posted: 0,
      total_posts: 0,
    };

    return res.json({
      identity: {
        type: identity.type,
        id: identity.authorRef,
      },
      summary: {
        threadsStarted: summary.threads_started,
        repliesPosted: summary.replies_posted,
        totalPosts: summary.total_posts,
      },
      startedThreads: startedThreadsResult.rows,
      replies: repliesResult.rows,
      activity: activityResult.rows,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Failed to fetch dashboard summary", {
      error: String(error?.message || error),
    });
  }
}
