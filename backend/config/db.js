import pkg from "pg";
import { env } from "./env.js";

const { Pool } = pkg;

function connectionStringRequiresSsl(connectionString) {
  try {
    const url = new URL(connectionString);
    const sslMode = String(url.searchParams.get("sslmode") ?? "").toLowerCase();
    return ["require", "prefer", "verify-ca", "verify-full"].includes(sslMode);
  } catch {
    return false;
  }
}

const useSsl = env.DB_SSL || connectionStringRequiresSsl(env.DATABASE_URL);

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  ssl: useSsl
    ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED }
    : undefined,
});

db.on("error", (error) => {
  console.error("Unexpected database client error", error);
});
