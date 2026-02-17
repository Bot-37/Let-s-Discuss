import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { parseCookies } from "../utils/cookies.js";

function parseBearerToken(authHeader) {
  if (typeof authHeader !== "string" || authHeader.trim().length === 0) return null;
  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  const token = rest.join(" ");
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token;
}

function parseCookieToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[env.AUTH_COOKIE_NAME];
  return typeof token === "string" && token.length > 0 ? token : null;
}

function getAuthToken(req) {
  const cookieToken = parseCookieToken(req);
  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }
  if (!env.ALLOW_BEARER_FALLBACK) {
    return { token: null, source: null };
  }
  const bearerToken = parseBearerToken(req.headers.authorization);
  if (!bearerToken) {
    return { token: null, source: null };
  }
  return { token: bearerToken, source: "bearer" };
}

function decodeToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
}

export function requireAuth(req, res, next) {
  const { token, source } = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication token is missing or invalid" });
  }

  try {
    const payload = decodeToken(token);
    req.user = { id: payload.uid, role: payload.role || "user" };
    req.authSource = source;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function optionalAuth(req, _res, next) {
  const { token, source } = getAuthToken(req);
  if (!token) {
    req.user = null;
    req.authSource = null;
    return next();
  }

  try {
    const payload = decodeToken(token);
    req.user = { id: payload.uid, role: payload.role || "user" };
    req.authSource = source;
  } catch {
    req.user = null;
    req.authSource = null;
  }

  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}
