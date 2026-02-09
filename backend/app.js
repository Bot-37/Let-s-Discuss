import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { issueCsrfToken, csrfProtection } from "./middleware/csrf.middleware.js";
import { createRateLimiter } from "./middleware/rateLimit.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import threadRoutes from "./routes/threads.routes.js";
import postRoutes from "./routes/posts.routes.js";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
    hsts: env.IS_PRODUCTION
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);
app.disable("x-powered-by");

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

const allowedOrigins = new Set(env.CORS_ORIGINS);
const allowAnyOrigin = allowedOrigins.has("*");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowAnyOrigin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: !allowAnyOrigin,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Anon-Id"],
    exposedHeaders: [
      "X-Anon-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "Retry-After",
    ],
  })
);

app.use(express.json({ limit: env.JSON_LIMIT }));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get(
  "/api/csrf-token",
  createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: "csrf" }),
  issueCsrfToken
);

app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/posts", postRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err?.message === "CORS origin not allowed") {
    return res.status(403).json({ message: "Origin is not allowed" });
  }
  console.error("Unhandled application error", err);
  res.status(500).json({ message: "Internal server error" });
});

export default app;
