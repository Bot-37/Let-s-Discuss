import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { sanitizeText } from "../utils/sanitize.js";

export async function register(req, res) {
  try {
    const username = sanitizeText(req.body.username, { maxLength: 32 });
    const password = req.body.password;

    const hash = await hashPassword(password);
    await db.query("INSERT INTO users (username, password_hash) VALUES ($1,$2)", [
      username,
      hash,
    ]);

    res.status(201).json({ message: "Account created" });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken" });
    }
    console.error("Register failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function login(req, res) {
  try {
    const username = sanitizeText(req.body.username, { maxLength: 32 });
    const password = req.body.password;

    const result = await db.query("SELECT id, username, password_hash FROM users WHERE username=$1", [
      username,
    ]);

    if (!result.rows.length) return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ uid: user.id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    return res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error("Login failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function me(req, res) {
  try {
    const result = await db.query("SELECT id, username, created_at FROM users WHERE id=$1", [
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch current user", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
