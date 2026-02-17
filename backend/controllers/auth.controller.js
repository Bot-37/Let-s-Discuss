import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { sendSafeError } from "../utils/security.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { sanitizeText } from "../utils/sanitize.js";
import { appendSetCookie, serializeCookie, serializeClearCookie } from "../utils/cookies.js";

function authCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    maxAge: env.AUTH_COOKIE_MAX_AGE_SEC,
    partitioned: env.AUTH_COOKIE_PARTITIONED,
  };
}

function issueToken(userId, role = "user") {
  return jwt.sign({ uid: userId, role }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: role === "admin" ? env.JWT_ADMIN_EXPIRES_IN : env.JWT_EXPIRES_IN,
  });
}

export async function register(req, res) {
  try {
    const username = sanitizeText(req.body.username, { maxLength: 32 });
    const password = req.body.password;

    const hash = await hashPassword(password);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ($1,$2,'user')", [
      username,
      hash,
    ]);

    res.status(201).json({ message: "Account created" });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username is already taken" });
    }
    return sendSafeError(res, 500, "Internal server error", "Register failed", {
      error: String(error?.message || error),
    });
  }
}

export async function login(req, res) {
  try {
    const username = sanitizeText(req.body.username, { maxLength: 32 });
    const password = req.body.password;

    const result = await db.query(
      "SELECT id, username, password_hash, role FROM users WHERE username=$1",
      [username]
    );

    if (!result.rows.length) return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = issueToken(user.id, user.role || "user");
    appendSetCookie(res, serializeCookie(env.AUTH_COOKIE_NAME, token, authCookieOptions()));

    return res.json({
      token,
      bearerFallbackEnabled: env.ALLOW_BEARER_FALLBACK,
      user: { id: user.id, username: user.username, role: user.role || "user" },
    });
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Login failed", {
      error: String(error?.message || error),
    });
  }
}

export async function me(req, res) {
  try {
    const result = await db.query("SELECT id, username, role, created_at FROM users WHERE id=$1", [
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Failed to fetch current user", {
      error: String(error?.message || error),
    });
  }
}

export async function logout(_req, res) {
  try {
    appendSetCookie(
      res,
      serializeClearCookie(env.AUTH_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
        secure: env.AUTH_COOKIE_SECURE,
        sameSite: env.AUTH_COOKIE_SAME_SITE,
        partitioned: env.AUTH_COOKIE_PARTITIONED,
      })
    );
    return res.status(200).json({ message: "Signed out" });
  } catch (error) {
    return sendSafeError(res, 500, "Internal server error", "Logout failed", {
      error: String(error?.message || error),
    });
  }
}
