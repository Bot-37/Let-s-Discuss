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
const corsOrigins = process.env.CORS_ORIGIN
  ? parseCsv(process.env.CORS_ORIGIN)
  : isProduction
    ? []
    : developmentCorsOrigins;
const dbSsl = toBool(process.env.DB_SSL, isProduction);
const dbSslRejectUnauthorized = toBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, false);
const adminUsername = process.env.ADMIN_USERNAME?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;

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

if ((adminUsername && !adminPassword) || (!adminUsername && adminPassword)) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must both be set together");
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
  CSRF_COOKIE_SAME_SITE: toSameSite(
    process.env.CSRF_COOKIE_SAME_SITE,
    isProduction ? "none" : "lax"
  ),
  ADMIN_USERNAME: adminUsername || null,
  ADMIN_PASSWORD: adminPassword || null,
});
