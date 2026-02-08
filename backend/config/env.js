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

const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: toInt(process.env.PORT, 4000),
  DATABASE_URL: process.env.DATABASE_URL,
  DB_POOL_MAX: toInt(process.env.DB_POOL_MAX, 10),
  DB_IDLE_TIMEOUT_MS: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  DB_CONNECTION_TIMEOUT_MS: toInt(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  DB_SSL: toBool(process.env.DB_SSL, false),
  DB_SSL_REJECT_UNAUTHORIZED: toBool(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
    true
  ),
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "6h",
  TRUST_PROXY: toBool(process.env.TRUST_PROXY, false),
  CORS_ORIGIN:
    process.env.CORS_ORIGIN ??
    "http://localhost:4000,http://127.0.0.1:4000,http://localhost:5500,http://127.0.0.1:5500",
  JSON_LIMIT: process.env.JSON_LIMIT ?? "100kb",
  CSRF_COOKIE_NAME: process.env.CSRF_COOKIE_NAME ?? "csrf_token",
  CSRF_MAX_AGE_SEC: toInt(process.env.CSRF_MAX_AGE_SEC, 2 * 60 * 60),
});
