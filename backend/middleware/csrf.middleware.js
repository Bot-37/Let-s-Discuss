import crypto from "crypto";
import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function parseCookies(cookieHeader = "") {
  const jar = {};
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) continue;
    jar[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return jar;
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", [cookieValue]);
    return;
  }
  const list = Array.isArray(current) ? current : [String(current)];
  list.push(cookieValue);
  res.setHeader("Set-Cookie", list);
}

function buildCookie(name, value, maxAgeSec) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  appendSetCookie(res, buildCookie(env.CSRF_COOKIE_NAME, token, env.CSRF_MAX_AGE_SEC));
  res.status(200).json({ csrfToken: token });
}

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path === "/csrf-token" || req.path === "/api/csrf-token") return next();

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && fetchSite === "cross-site") {
    return res.status(403).json({ message: "Cross-site requests are forbidden" });
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[env.CSRF_COOKIE_NAME];
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
}
