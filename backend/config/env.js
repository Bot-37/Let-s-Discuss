import dotenv from "dotenv";

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (origin === "*") return origin;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`CORS origin must use http/https: ${origin}`);
  }

  if (parsed.origin !== origin) {
    throw new Error(
      `CORS origin must be exact and without trailing slash/path/query: ${origin}`
    );
  }
  return parsed.origin;
}

function normalizeOriginList(origins) {
  return origins.map(normalizeOrigin);
}

function toSameSite(value, fallback) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "strict" || normalized === "lax" || normalized === "none") {
    return normalized;
  }
  return fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const developmentCorsOrigins = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];
const rawCorsOrigins = process.env.CORS_ORIGIN
  ? parseCsv(process.env.CORS_ORIGIN)
  : isProduction
    ? []
    : developmentCorsOrigins;
const corsOrigins = normalizeOriginList(rawCorsOrigins);
const dbSsl = toBool(process.env.DB_SSL, isProduction);
const dbSslRejectUnauthorized = toBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, false);
const adminPassword = process.env.ADMIN_PASSWORD;
const csrfCookieSameSite = toSameSite(
  process.env.CSRF_COOKIE_SAME_SITE,
  isProduction ? "none" : "lax"
);
const csrfCookieSecure = toBool(
  process.env.CSRF_COOKIE_SECURE,
  isProduction || csrfCookieSameSite === "none"
);
const authCookieSameSite = toSameSite(
  process.env.AUTH_COOKIE_SAME_SITE,
  isProduction ? "none" : "lax"
);
const authCookieSecure = toBool(
  process.env.AUTH_COOKIE_SECURE,
  isProduction || authCookieSameSite === "none"
);
const authCookiePartitioned = toBool(
  process.env.AUTH_COOKIE_PARTITIONED,
  isProduction && authCookieSameSite === "none"
);
const anonCookieSameSite = toSameSite(process.env.ANON_COOKIE_SAME_SITE, authCookieSameSite);
const anonCookieSecure = toBool(process.env.ANON_COOKIE_SECURE, authCookieSecure);
const anonCookiePartitioned = toBool(process.env.ANON_COOKIE_PARTITIONED, authCookiePartitioned);
const anonCookieSecret = process.env.ANON_COOKIE_SECRET || process.env.JWT_SECRET;

const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

if (isProduction && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must be configured in production");
}

if (corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGIN cannot include '*' for cookie-based authentication");
}

if (csrfCookieSameSite === "none" && !csrfCookieSecure) {
  throw new Error("CSRF cookie must be Secure when CSRF_COOKIE_SAME_SITE=none");
}

if (authCookieSameSite === "none" && !authCookieSecure) {
  throw new Error("Auth cookie must be Secure when AUTH_COOKIE_SAME_SITE=none");
}

if (anonCookieSameSite === "none" && !anonCookieSecure) {
  throw new Error("Anon cookie must be Secure when ANON_COOKIE_SAME_SITE=none");
}

if (authCookiePartitioned && !authCookieSecure) {
  throw new Error("AUTH_COOKIE_PARTITIONED requires AUTH_COOKIE_SECURE=true");
}

if (anonCookiePartitioned && !anonCookieSecure) {
  throw new Error("ANON_COOKIE_PARTITIONED requires ANON_COOKIE_SECURE=true");
}

if (anonCookieSecret.length < 32) {
  throw new Error("ANON_COOKIE_SECRET must be at least 32 characters long");
}

if (adminPassword && adminPassword.length < 14) {
  throw new Error("ADMIN_PASSWORD must be at least 14 characters long");
}

export const env = Object.freeze({
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: isProduction,
  PORT: toInt(process.env.PORT, 4000),
  DATABASE_URL: process.env.DATABASE_URL,
  DB_POOL_MAX: toInt(process.env.DB_POOL_MAX, 10),
  DB_IDLE_TIMEOUT_MS: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  DB_CONNECTION_TIMEOUT_MS: toInt(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  DB_SSL: dbSsl,
  DB_SSL_REJECT_UNAUTHORIZED: dbSslRejectUnauthorized,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "6h",
  JWT_ADMIN_EXPIRES_IN: process.env.JWT_ADMIN_EXPIRES_IN ?? "2h",
  TRUST_PROXY: toBool(process.env.TRUST_PROXY, false),
  CORS_ORIGINS: corsOrigins,
  JSON_LIMIT: process.env.JSON_LIMIT ?? "100kb",
  EXPOSE_VALIDATION_DETAILS: toBool(process.env.EXPOSE_VALIDATION_DETAILS, !isProduction),
  CSRF_COOKIE_NAME: process.env.CSRF_COOKIE_NAME ?? "csrf_token",
  CSRF_MAX_AGE_SEC: toInt(process.env.CSRF_MAX_AGE_SEC, 2 * 60 * 60),
  CSRF_COOKIE_SAME_SITE: csrfCookieSameSite,
  CSRF_COOKIE_SECURE: csrfCookieSecure,
  AUTH_COOKIE_NAME: process.env.AUTH_COOKIE_NAME ?? "auth_token",
  AUTH_COOKIE_MAX_AGE_SEC: toInt(process.env.AUTH_COOKIE_MAX_AGE_SEC, 6 * 60 * 60),
  AUTH_COOKIE_SAME_SITE: authCookieSameSite,
  AUTH_COOKIE_SECURE: authCookieSecure,
  AUTH_COOKIE_PARTITIONED: authCookiePartitioned,
  ALLOW_BEARER_FALLBACK: toBool(process.env.ALLOW_BEARER_FALLBACK, true),
  ANON_COOKIE_NAME: process.env.ANON_COOKIE_NAME ?? "anon_session",
  ANON_COOKIE_SECRET: anonCookieSecret,
  ANON_COOKIE_MAX_AGE_SEC: toInt(process.env.ANON_COOKIE_MAX_AGE_SEC, 30 * 24 * 60 * 60),
  ANON_COOKIE_SAME_SITE: anonCookieSameSite,
  ANON_COOKIE_SECURE: anonCookieSecure,
  ANON_COOKIE_PARTITIONED: anonCookiePartitioned,
  SUPER_ADMIN_USERNAME: "Bot37",
  ADMIN_PASSWORD: adminPassword || null,
});
