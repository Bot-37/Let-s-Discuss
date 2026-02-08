import { db } from "../config/db.js";
import { normalizePostContent } from "../utils/sanitize.js";

export async function getPosts(req, res) {
  try {
    const { threadId } = req.params;

    const { rows } = await db.query(
      `SELECT
         p.id,
         p.thread_id,
         p.content,
         p.author_type,
         p.author_ref,
         p.created_at,
         u.username AS author_username
       FROM posts p
       LEFT JOIN users u ON p.author_type = 'user' AND p.author_ref = u.id::text
       WHERE thread_id=$1
       ORDER BY p.created_at`,
      [threadId]
    );

    return res.json(rows);
  } catch (error) {
    console.error("Failed to fetch posts", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createPost(req, res) {
  try {
    const content = normalizePostContent(req.body.content, { maxLength: 5000 });
    const { threadId } = req.params;
    const authorType = req.user?.id ? "user" : "anon";
    const authorRef = req.user?.id ?? req.anonId;

    if (!content) {
      return res.status(400).json({ message: "Post content cannot be empty" });
    }

    const { rows } = await db.query(
      `INSERT INTO posts 
       (thread_id, content, author_type, author_ref)
       VALUES ($1,$2,$3,$4)
       RETURNING id,thread_id,content,author_type,author_ref,created_at`,
      [threadId, content, authorType, authorRef]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(404).json({ message: "Thread not found" });
    }
    console.error("Failed to create post", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
