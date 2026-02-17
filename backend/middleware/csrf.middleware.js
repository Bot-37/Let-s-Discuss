import crypto from "crypto";
import { env } from "../config/env.js";
import { appendSetCookie, parseCookies, serializeCookie } from "../utils/cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function tokensEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (left.length === 0 || right.length === 0) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  appendSetCookie(
    res,
    serializeCookie(env.CSRF_COOKIE_NAME, token, {
      path: "/",
      sameSite: env.CSRF_COOKIE_SAME_SITE,
      secure: env.CSRF_COOKIE_SECURE,
      maxAge: env.CSRF_MAX_AGE_SEC,
    })
  );
  res.status(200).json({ csrfToken: token, csrfCookieName: env.CSRF_COOKIE_NAME });
}

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path === "/csrf-token" || req.path === "/api/csrf-token") return next();

  const allowedOrigins = new Set(env.CORS_ORIGINS);
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ message: "Origin is not allowed" });
  }

  const fetchSite = req.headers["sec-fetch-site"];
  if (!origin && fetchSite && fetchSite === "cross-site") {
    return res.status(403).json({ message: "Cross-site requests are forbidden" });
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[env.CSRF_COOKIE_NAME];
  const rawHeaderToken = req.headers["x-csrf-token"];
  const headerToken = Array.isArray(rawHeaderToken) ? rawHeaderToken[0] : rawHeaderToken;

  if (!cookieToken || !headerToken || !tokensEqual(cookieToken, headerToken)) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
}
