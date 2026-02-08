import { db } from "../config/db.js";
import { normalizePostContent, sanitizeText } from "../utils/sanitize.js";

export async function getThreads(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT
         t.id,
         t.title,
         t.created_at,
         COUNT(p.id)::int AS post_count,
         GREATEST(t.created_at, COALESCE(MAX(p.created_at), t.created_at)) AS last_activity_at
       FROM threads t
       LEFT JOIN posts p ON p.thread_id = t.id
       GROUP BY t.id
       ORDER BY last_activity_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error("Failed to fetch threads", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getThreadById(req, res) {
  try {
    const { threadId } = req.params;
    const { rows } = await db.query(
      `SELECT
         t.id,
         t.title,
         t.created_at,
         COUNT(p.id)::int AS post_count,
         GREATEST(t.created_at, COALESCE(MAX(p.created_at), t.created_at)) AS last_activity_at
       FROM threads t
       LEFT JOIN posts p ON p.thread_id = t.id
       WHERE t.id = $1
       GROUP BY t.id`,
      [threadId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Thread not found" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Failed to fetch thread", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createThread(req, res) {
  const client = await db.connect();
  try {
    const title = sanitizeText(req.body.title, { maxLength: 200 });
    const firstPostContent = normalizePostContent(req.body.content, { maxLength: 5000 });
    if (!title || title.length < 3) {
      return res.status(400).json({ message: "Thread title is invalid" });
    }

    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO threads (title) VALUES ($1) RETURNING id, title, created_at",
      [title]
    );

    if (firstPostContent) {
      const authorType = req.user?.id ? "user" : "anon";
      const authorRef = req.user?.id ?? req.anonId;
      await client.query(
        `INSERT INTO posts (thread_id, content, author_type, author_ref)
         VALUES ($1,$2,$3,$4)`,
        [rows[0].id, firstPostContent, authorType, authorRef]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create thread", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
}
